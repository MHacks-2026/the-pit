'use client';

import { useMemo } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';
import { liveConnectionBuilder } from '../../lib/live';
import { COP_PENALTY } from '../../lib/copScore';
import DepthChart from './DepthChart';
import DepthXray from './DepthXray';
import PriceChart from './PriceChart';
import TraderBadge from '../TraderBadge';
import { SCREEN_TRADES_WINDOW_MS, useOpenAndRecentOrders, useRecentTrades } from '../../lib/subscriptions';

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
  // Filtered: open + recent orders and the last 30 minutes of trades, not the whole history.
  const [orders, ordersReady] = useOpenAndRecentOrders();
  const [trades] = useRecentTrades(SCREEN_TRADES_WINDOW_MS);
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
    const botByKey = new Map<string, boolean>();
    for (const a of accounts) {
      nameByKey.set(a.identity.toHexString(), a.name || `Trader ${a.identity.toHexString().slice(0, 6)}`);
      botByKey.set(a.identity.toHexString(), a.isBot);
    }
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
      bot: botByKey.get(t.taker.toHexString()) ?? false,
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

    const xrayOrders = open.map(o => ({ id: o.id.toString(), side: o.side === 'buy' ? 'buy' as const : 'sell' as const, price: o.price, remaining: o.remaining }));
    const xrayTrades = marketTrades.slice(-200).map(t => ({ id: t.id.toString(), price: t.price }));
    const evidence = alerts.map(al => al.evidence);

    return {
      xrayOrders, xrayTrades, evidence,
      allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty,
      lastPrice, prevPrice, high, low, volume, sessionChange, sessionPct, tradeCount: marketTrades.length,
      tape, chart, leaderboard, copBoard,
      humans, bots: accounts.length - humans, openOrders: open.length, alertCount: alerts.length,
      newsText: latestNews ? latestNews.text : null,
    };
  }, [orders, trades, accounts, positions, alerts, news]);

  if (connectionError) {
    return <p className="state" role="alert">The live market is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  }
  if (!ordersReady) {
    return <p className="state" role="status">Connecting to the live market…</p>;
  }

  const { allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty, lastPrice, prevPrice, tape, chart, leaderboard, copBoard } = view;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const dir = lastPrice !== null && prevPrice !== null && lastPrice !== prevPrice ? (lastPrice > prevPrice ? 'up' : 'down') : 'flat';

  const delta = dir !== 'flat' && lastPrice !== null && prevPrice !== null ? Math.abs(lastPrice - prevPrice) : null;

  return (
    <div className="board">
      <section className="quote" aria-label="Price">
        <p className="quote-symbol">HACK</p>
        <div className="quote-row">
          <p key={lastPrice ?? 'none'} className={`quote-price flash-${dir}`}>{lastPrice === null ? '—' : lastPrice}</p>
          {delta !== null ? <p className={`quote-delta ${dir}`}>{dir === 'up' ? '▲' : '▼'} {delta}</p> : null}
        </div>
        <dl className="quote-touch">
          <div><dt>Bid</dt><dd>{bestBid ?? '—'}</dd></div>
          <div><dt>Ask</dt><dd>{bestAsk ?? '—'}</dd></div>
          <div><dt>Spread</dt><dd>{spread ?? '—'}</dd></div>
        </dl>
        <PriceChart points={chart} />
        <dl className="quote-range">
          <div><dt>High</dt><dd>{view.high ?? '—'}</dd></div>
          <div><dt>Low</dt><dd>{view.low ?? '—'}</dd></div>
          <div>
            <dt>Change, 30 min</dt>
            <dd className={view.sessionChange === null ? undefined : view.sessionChange >= 0 ? 'up' : 'down'}>
              {view.sessionChange === null ? '—' : `${signed(view.sessionChange)}${view.sessionPct !== null ? ` (${view.sessionPct >= 0 ? '+' : '−'}${Math.abs(view.sessionPct).toFixed(1)}%)` : ''}`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="ladder" aria-label="Order book">
        <h3>Order book</h3>
        <div className="ladder-cols">
          <div>
            <p className="ladder-head"><span>Bid</span><span>Size</span></p>
            <ol className="ladder-side">
              {bids.length === 0 ? <li className="quiet">No bids</li> : bids.map(l => (
                <li className="ladder-row ladder-bid" key={`b${l.price}`}>
                  <span className="ladder-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                  <span>{l.price}</span><span>{l.qty}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="ladder-head"><span>Ask</span><span>Size</span></p>
            <ol className="ladder-side">
              {asks.length === 0 ? <li className="quiet">No asks</li> : asks.map(l => (
                <li className="ladder-row ladder-ask" key={`a${l.price}`}>
                  <span className="ladder-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                  <span>{l.price}</span><span>{l.qty}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <h3 className="depth-title">Depth</h3>
        <DepthChart bids={allBids} asks={allAsks} />
      </section>

      <DepthXray orders={view.xrayOrders} trades={view.xrayTrades} evidence={view.evidence}
        bestBid={bestBid} bestAsk={bestAsk} lastPrice={lastPrice} />

      <dl className="tally">
        <div><dt>Traders</dt><dd>{view.humans}<small> and {view.bots} bots</small></dd></div>
        <div><dt>Trades, 30 min</dt><dd>{fmt(view.tradeCount)}</dd></div>
        <div><dt>Volume, 30 min</dt><dd>{fmt(view.volume)}</dd></div>
        <div><dt>Open orders</dt><dd>{fmt(view.openOrders)}</dd></div>
        <div className={view.alertCount > 0 ? 'tally-cop' : undefined}><dt>Cop alerts</dt><dd>{fmt(view.alertCount)}</dd></div>
      </dl>

      {view.newsText ? <p className="news"><b>News</b> {view.newsText}</p> : null}

      <section className="tape" aria-label="Trade tape">
        <h3>Tape</h3>
        {tape.length === 0 ? <p className="quiet">No trades yet.</p> : (
          <ol className="rows">
            {tape.map(t => (
              <li className="tape-row" key={t.id}>
                <b className={`tape-px ${t.side === 'sell' ? 'down' : 'up'}`}>{t.price}</b>
                <span className="tape-qty">×{t.qty}</span>
                <TraderBadge name={t.who} isBot={t.bot} />
                <span className="tape-who">{t.side ? (t.side === 'buy' ? 'bought' : 'sold') : ''}</span>
                <time dateTime={new Date(t.ts).toISOString()}>{new Date(t.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="standings" aria-label="Leaderboard">
        <h3>Leaderboard</h3>
        {leaderboard.length === 0 ? <p className="quiet">No traders yet.</p> : (
          <ol className="rows">
            {leaderboard.map((row, i) => {
              const gain = row.net - START_CASH;
              return (
                <li className="rank-row" key={row.key}>
                  <span className="rank-n">{i + 1}</span>
                  <TraderBadge name={row.name} isBot={row.isBot} />
                  <span className="rank-name">{row.name}</span>
                  <span className="rank-pos">{row.pos === 0 ? 'flat' : `${row.pos > 0 ? 'long' : 'short'} ${Math.abs(row.pos)}`}</span>
                  <span className="rank-net">{fmt(row.net)}</span>
                  <span className={gain >= 0 ? 'up' : 'down'}>{signed(gain)}</span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="quiet">Net worth at the current mid price. Outlined badges are bots.</p>
      </section>

      <section className="beat" aria-label="Beat the Cop">
        <h3>Beat the Cop</h3>
        {copBoard.length === 0 ? <p className="quiet">No players yet. Scan the code to take the challenge.</p> : (
          <ol className="rows">
            {copBoard.map((row, i) => (
              <li className="rank-row beat-row" key={row.key}>
                <span className="rank-n">{i + 1}</span>
                <TraderBadge name={row.name} isBot={false} />
                <span className="rank-name">{row.name}</span>
                <span className={row.score >= 0 ? 'up' : 'down'}>{signed(row.score)}</span>
                <span className="rank-pos">caught {row.caught}×</span>
              </li>
            ))}
          </ol>
        )}
        <p className="quiet">Score is profit minus {COP_PENALTY} for every Cop alert.</p>
      </section>
    </div>
  );
}

export default function MarketBoard() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? liveConnectionBuilder(uri, database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="state" role="alert">The live market is not configured. Set NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><Board /></SpacetimeDBProvider>;
}
