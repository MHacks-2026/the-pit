'use client';

import { useMemo } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import { COP_PENALTY } from '../../lib/copScore';
import DepthChart from './DepthChart';
import PriceChart from './PriceChart';

const HACK_MARKET_ID = 1;
const START_CASH = 10_000;
const BOOK_LEVELS = 8;
const TAPE_ROWS = 12;
const CHART_POINTS = 300;

type Level = { price: number; qty: number };

function micros(ts: { microsSinceUnixEpoch: bigint }): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

function Board() {
  const { connectionError } = useSpacetimeDB();
  const [orders, ordersReady] = useTable(tables.order);
  const [trades] = useTable(tables.trade);
  const [accounts] = useTable(tables.account);
  const [positions] = useTable(tables.position);
  const [alerts] = useTable(tables.alert);
  const [news] = useTable(tables.news);

  const view = useMemo(() => {
    const open = orders.filter(o => o.marketId === HACK_MARKET_ID && o.status === 'open' && o.remaining > 0);
    const levelsFor = (side: string): Level[] => {
      const byPrice = new Map<number, number>();
      for (const o of open) {
        if (o.side === side) byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.remaining);
      }
      return [...byPrice.entries()].map(([price, qty]) => ({ price, qty }));
    };
    const allBids = levelsFor('buy').sort((a, b) => b.price - a.price);
    const allAsks = levelsFor('sell').sort((a, b) => a.price - b.price);
    const bids = allBids.slice(0, BOOK_LEVELS);
    const asks = allAsks.slice(0, BOOK_LEVELS);
    const bestBid = bids.length ? bids[0].price : null;
    const bestAsk = asks.length ? asks[0].price : null;
    const maxQty = Math.max(1, ...bids.map(l => l.qty), ...asks.map(l => l.qty));

    const nameByKey = new Map<string, string>();
    for (const a of accounts) nameByKey.set(a.identity.toHexString(), a.name || `Trader ${a.identity.toHexString().slice(0, 6)}`);
    const sideByOrder = new Map<string, string>();
    for (const o of orders) sideByOrder.set(o.id.toString(), o.side);

    const marketTrades = trades
      .filter(t => t.marketId === HACK_MARKET_ID)
      .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
    const prices = marketTrades.map(t => t.price);
    const lastPrice = prices.length ? prices[prices.length - 1] : null;
    const prevPrice = prices.length > 1 ? prices[prices.length - 2] : null;
    const firstPrice = prices.length ? prices[0] : null;
    const high = prices.length ? Math.max(...prices) : null;
    const low = prices.length ? Math.min(...prices) : null;
    const volume = marketTrades.reduce((sum, t) => sum + t.qty, 0);
    const sessionChange = lastPrice !== null && firstPrice !== null ? lastPrice - firstPrice : null;
    const sessionPct = sessionChange !== null && firstPrice ? (sessionChange / firstPrice) * 100 : null;

    const tape = marketTrades.slice(-TAPE_ROWS).reverse().map(t => ({
      id: t.id.toString(),
      price: t.price,
      qty: t.qty,
      side: sideByOrder.get(t.takerOrderId.toString()) ?? null,
      who: nameByKey.get(t.taker.toHexString()) ?? 'Trader',
      ts: micros(t.ts),
    }));
    const chart = marketTrades.slice(-CHART_POINTS).map(t => ({ price: t.price, ts: micros(t.ts) }));

    const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (lastPrice ?? 100);

    const qtyByOwner = new Map<string, number>();
    for (const p of positions) {
      if (p.marketId === HACK_MARKET_ID) qtyByOwner.set(p.owner.toHexString(), p.qty);
    }
    const leaderboard = accounts
      .map(a => {
        const key = a.identity.toHexString();
        const pos = qtyByOwner.get(key) ?? 0;
        const net = Number(a.cash) + pos * mid;
        return { key, name: nameByKey.get(key) ?? key.slice(0, 6), isBot: a.isBot, pos, net };
      })
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);

    const caughtBy = new Map<string, number>();
    for (const al of alerts) {
      const key = al.owner.toHexString();
      caughtBy.set(key, (caughtBy.get(key) ?? 0) + 1);
    }
    const copBoard = accounts
      .filter(a => !a.isBot)
      .map(a => {
        const key = a.identity.toHexString();
        const caught = caughtBy.get(key) ?? 0;
        const net = Number(a.cash) + (qtyByOwner.get(key) ?? 0) * mid;
        return { key, name: nameByKey.get(key) ?? key.slice(0, 6), caught, score: Math.round(net - START_CASH - COP_PENALTY * caught) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const humans = accounts.filter(a => !a.isBot).length;
    const latestNews = news.length
      ? [...news].sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? 1 : -1))[0]
      : null;

    return {
      allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty,
      lastPrice, prevPrice, high, low, volume, sessionChange, sessionPct, tradeCount: marketTrades.length,
      tape, chart, leaderboard, copBoard,
      humans, bots: accounts.length - humans, openOrders: open.length, alertCount: alerts.length,
      newsText: latestNews ? latestNews.text : null,
    };
  }, [orders, trades, accounts, positions, alerts, news]);

  if (connectionError) {
    return <p className="feed-state" role="alert">The live market is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  }
  if (!ordersReady) {
    return <p className="feed-state" role="status">Connecting to the live market…</p>;
  }

  const { allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty, lastPrice, prevPrice, tape, chart, leaderboard, copBoard } = view;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const dir = lastPrice !== null && prevPrice !== null && lastPrice !== prevPrice ? (lastPrice > prevPrice ? 'up' : 'down') : 'flat';

  return (
    <div className="board-grid">
      {view.newsText ? (
        <p className="news-strip"><b>News</b>{view.newsText}</p>
      ) : null}

      <dl className="board-stats">
        <div><dt>Volume</dt><dd>{fmt(view.volume)}</dd></div>
        <div><dt>Trades</dt><dd>{fmt(view.tradeCount)}</dd></div>
        <div><dt>Traders</dt><dd>{view.humans}<small> + {view.bots} bots</small></dd></div>
        <div><dt>Open orders</dt><dd>{fmt(view.openOrders)}</dd></div>
        <div><dt>Cop alerts</dt><dd className={view.alertCount > 0 ? 'stat-amber' : undefined}>{fmt(view.alertCount)}</dd></div>
      </dl>

      <section className="board-card" aria-label="Price">
        <div className="board-cardhead"><h3>HACK</h3><span className="board-chip">Play dollars</span></div>
        <div className="board-hero">
          <p key={lastPrice ?? 'none'} className={`board-price flash-${dir}`}>{lastPrice === null ? '—' : lastPrice}</p>
          {dir !== 'flat' && lastPrice !== null && prevPrice !== null ? (
            <span className={`board-delta ${dir}`}>{dir === 'up' ? '▲' : '▼'} {Math.abs(lastPrice - prevPrice)}</span>
          ) : null}
        </div>
        <p className="board-sub">
          Bid {bestBid ?? '—'} · Ask {bestAsk ?? '—'}{spread !== null ? ` · Spread ${spread}` : ''}
        </p>
        <PriceChart points={chart} />
        <dl className="board-mini">
          <div><dt>High</dt><dd>{view.high ?? '—'}</dd></div>
          <div><dt>Low</dt><dd>{view.low ?? '—'}</dd></div>
          <div>
            <dt>Session</dt>
            <dd className={view.sessionChange === null ? undefined : view.sessionChange >= 0 ? 'rank-up' : 'rank-down'}>
              {view.sessionChange === null ? '—' : `${signed(view.sessionChange)}${view.sessionPct !== null ? ` (${view.sessionPct >= 0 ? '+' : '−'}${Math.abs(view.sessionPct).toFixed(1)}%)` : ''}`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="board-card" aria-label="Order book">
        <div className="board-cardhead"><h3>Order book</h3>{spread !== null ? <span className="board-chip">Spread {spread}</span> : null}</div>
        <div className="book-cols">
          <div>
            <p className="book-colhead"><span>Bid</span><span>Size</span></p>
            <ol className="book-side">
              {bids.length === 0 ? <li className="board-sub">No bids</li> : bids.map(l => (
                <li className="book-row book-bid" key={`b${l.price}`}>
                  <span className="book-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                  <span>{l.price}</span><span>{l.qty}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="book-colhead"><span>Ask</span><span>Size</span></p>
            <ol className="book-side">
              {asks.length === 0 ? <li className="board-sub">No asks</li> : asks.map(l => (
                <li className="book-row book-ask" key={`a${l.price}`}>
                  <span className="book-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                  <span>{l.price}</span><span>{l.qty}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="board-card" aria-label="Market depth">
        <div className="board-cardhead"><h3>Market depth</h3><span className="board-chip">Total size by price</span></div>
        <DepthChart bids={allBids} asks={allAsks} />
      </section>

      <section className="board-card" aria-label="Trade tape">
        <div className="board-cardhead"><h3>Tape</h3><span className="board-chip">Latest trades</span></div>
        {tape.length === 0 ? <p className="board-sub">No trades yet.</p> : (
          <ol className="board-list">
            {tape.map(t => (
              <li className="tape-row" key={t.id}>
                <span className="tape-main">
                  <b className={`tape-px ${t.side === 'sell' ? 'down' : 'up'}`}>{t.price}</b>
                  <span className="tape-qty">× {t.qty}</span>
                </span>
                <span className="tape-who">{t.side ? `${t.who} ${t.side === 'buy' ? 'bought' : 'sold'}` : t.who}</span>
                <time dateTime={new Date(t.ts).toISOString()}>{new Date(t.ts).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="board-card" aria-label="Leaderboard">
        <div className="board-cardhead"><h3>Leaderboard</h3><span className="board-chip">Net worth, bots marked 🤖</span></div>
        {leaderboard.length === 0 ? <p className="board-sub">No traders yet.</p> : (
          <ol className="board-list">
            {leaderboard.map((row, i) => {
              const delta = row.net - START_CASH;
              return (
                <li className="rank-row" key={row.key}>
                  <span className="rank-n">{i + 1}</span>
                  <span>{row.isBot ? '🤖 ' : ''}{row.name}</span>
                  <span className="rank-pos">{row.pos === 0 ? 'flat' : `${row.pos > 0 ? 'long' : 'short'} ${Math.abs(row.pos)}`}</span>
                  <span>{fmt(row.net)}</span>
                  <span className={delta >= 0 ? 'rank-up' : 'rank-down'}>{signed(delta)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="board-card" aria-label="Beat the Cop">
        <div className="board-cardhead"><h3>Beat the Cop</h3><span className="board-chip">Humans only</span></div>
        {copBoard.length === 0 ? <p className="board-sub">No players yet.</p> : (
          <ol className="board-list">
            {copBoard.map((row, i) => (
              <li className="rank-row cop-row" key={row.key}>
                <span className="rank-n">{i + 1}</span>
                <span>{row.name}</span>
                <span className={row.score >= 0 ? 'rank-up' : 'rank-down'}>{signed(row.score)}</span>
                <span className="rank-pos">caught {row.caught}×</span>
              </li>
            ))}
          </ol>
        )}
        <p className="board-sub">Profit minus {COP_PENALTY} points for every Cop alert.</p>
      </section>
    </div>
  );
}

export default function MarketBoard() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="feed-state" role="alert">The live market is not configured. Set NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><Board /></SpacetimeDBProvider>;
}
