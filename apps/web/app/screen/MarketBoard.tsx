'use client';

import { useMemo } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import { COP_PENALTY } from '../../lib/copScore';
import DepthChart from './DepthChart';

const HACK_MARKET_ID = 1;
const START_CASH = 10_000;
const BOOK_LEVELS = 8;
const TAPE_ROWS = 12;
const CHART_POINTS = 60;
const CHART_W = 600;
const CHART_H = 180;

type Level = { price: number; qty: number };

function micros(ts: { microsSinceUnixEpoch: bigint }): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function Board() {
  const { connectionError } = useSpacetimeDB();
  const [orders, ordersReady] = useTable(tables.order);
  const [trades] = useTable(tables.trade);
  const [accounts] = useTable(tables.account);
  const [positions] = useTable(tables.position);
  const [alerts] = useTable(tables.alert);

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

    const marketTrades = trades
      .filter(t => t.marketId === HACK_MARKET_ID)
      .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
    const lastPrice = marketTrades.length ? marketTrades[marketTrades.length - 1].price : null;
    const tape = marketTrades.slice(-TAPE_ROWS).reverse();
    const chart = marketTrades.slice(-CHART_POINTS).map(t => t.price);

    const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (lastPrice ?? 100);

    const qtyByOwner = new Map<string, number>();
    for (const p of positions) {
      if (p.marketId === HACK_MARKET_ID) qtyByOwner.set(p.owner.toHexString(), p.qty);
    }
    const leaderboard = accounts
      .map(a => {
        const key = a.identity.toHexString();
        const net = Number(a.cash) + (qtyByOwner.get(key) ?? 0) * mid;
        return { key, name: a.name || `Trader ${key.slice(0, 6)}`, isBot: a.isBot, net };
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
        return { key, name: a.name || `Trader ${key.slice(0, 6)}`, caught, score: Math.round(net - START_CASH - COP_PENALTY * caught) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { copBoard, allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty, lastPrice, tape, chart, leaderboard };
  }, [orders, trades, accounts, positions, alerts]);

  if (connectionError) {
    return <p className="feed-state" role="alert">The live market is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  }
  if (!ordersReady) {
    return <p className="feed-state" role="status">Connecting to the live market…</p>;
  }

  const { copBoard, allBids, allAsks, bids, asks, bestBid, bestAsk, maxQty, lastPrice, tape, chart, leaderboard } = view;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  let chartPoints = '';
  if (chart.length >= 2) {
    const lo = Math.min(...chart);
    const hi = Math.max(...chart);
    const span = hi === lo ? 2 : hi - lo;
    const base = hi === lo ? lo - 1 : lo;
    chartPoints = chart
      .map((price, i) => {
        const x = (i / (chart.length - 1)) * CHART_W;
        const y = CHART_H - ((price - base) / span) * (CHART_H - 20) - 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <div className="board-grid">
      <section className="board-card" aria-label="Price">
        <h3>HACK price</h3>
        <p className="board-price">{lastPrice === null ? '—' : lastPrice}</p>
        <p className="board-sub">
          Bid {bestBid ?? '—'} · Ask {bestAsk ?? '—'}{spread !== null ? ` · Spread ${spread}` : ''}
        </p>
        {chartPoints ? (
          <svg className="board-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="Recent trade prices">
            <polyline className="board-chart-line" points={chartPoints} />
          </svg>
        ) : (
          <p className="board-sub">Waiting for trades to draw the chart.</p>
        )}
      </section>

      <section className="board-card" aria-label="Order book">
        <h3>Order book</h3>
        <div className="book-cols">
          <ol className="book-side">
            {bids.length === 0 ? <li className="board-sub">No bids</li> : bids.map(l => (
              <li className="book-row book-bid" key={`b${l.price}`}>
                <span className="book-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                <span>{l.price}</span><span>{l.qty}</span>
              </li>
            ))}
          </ol>
          <ol className="book-side">
            {asks.length === 0 ? <li className="board-sub">No asks</li> : asks.map(l => (
              <li className="book-row book-ask" key={`a${l.price}`}>
                <span className="book-bar" style={{ width: `${(l.qty / maxQty) * 100}%` }} />
                <span>{l.price}</span><span>{l.qty}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="board-card board-wide" aria-label="Depth chart">
        <h3>Market depth</h3>
        <DepthChart bids={allBids} asks={allAsks} />
      </section>

      <section className="board-card" aria-label="Trade tape">
        <h3>Tape</h3>
        {tape.length === 0 ? <p className="board-sub">No trades yet.</p> : (
          <ol className="board-list">
            {tape.map(t => (
              <li className="tape-row" key={t.id.toString()}>
                <span>{t.qty} @ {t.price}</span>
                <time dateTime={new Date(micros(t.ts)).toISOString()}>{new Date(micros(t.ts)).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="board-card" aria-label="Leaderboard">
        <h3>Leaderboard</h3>
        {leaderboard.length === 0 ? <p className="board-sub">No traders yet.</p> : (
          <ol className="board-list">
            {leaderboard.map((row, i) => {
              const delta = row.net - START_CASH;
              return (
                <li className="rank-row" key={row.key}>
                  <span className="rank-n">{i + 1}</span>
                  <span>{row.isBot ? '🤖 ' : ''}{row.name}</span>
                  <span>{fmt(row.net)}</span>
                  <span className={delta >= 0 ? 'rank-up' : 'rank-down'}>{delta >= 0 ? '+' : ''}{fmt(delta)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="board-card" aria-label="Beat the Cop">
        <h3>Beat the Cop</h3>
        {copBoard.length === 0 ? <p className="board-sub">No players yet.</p> : (
          <ol className="board-list">
            {copBoard.map((row, i) => (
              <li className="rank-row" key={row.key}>
                <span className="rank-n">{i + 1}</span>
                <span>{row.name}</span>
                <span className={row.score >= 0 ? 'rank-up' : 'rank-down'}>{row.score >= 0 ? '+' : ''}{fmt(row.score)}</span>
                <span className="rank-n">caught {row.caught}×</span>
              </li>
            ))}
          </ol>
        )}
        <p className="board-sub">Profit minus {COP_PENALTY} per Cop alert. Humans only.</p>
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
