'use client';

// The scrolling market ticker, usable on any page. It opens its own live connection, so it works next to
// the trade and join pages as well as the Big Screen.

import { useMemo } from 'react';
import { SpacetimeDBProvider, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import Marquee, { type MarqueeItem } from './screen/Marquee';
import { PHONE_TRADES_WINDOW_MS, useOpenAndRecentOrders, useRecentTrades } from '../lib/subscriptions';

const HACK_MARKET_ID = 1;
const START_CASH = 10_000;

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

function TickerInner() {
  // Filtered: open + recent orders and recent trades, not the whole history (this ticker runs on phones too).
  const [orders] = useOpenAndRecentOrders();
  const [trades] = useRecentTrades(PHONE_TRADES_WINDOW_MS);
  const [accounts] = useTable(tables.account);
  const [positions] = useTable(tables.position);
  const [alerts] = useTable(tables.alert);
  const [news] = useTable(tables.news);

  const items = useMemo(() => {
    const nameByKey = new Map<string, string>();
    for (const a of accounts) nameByKey.set(a.identity.toHexString(), a.name || `Trader ${a.identity.toHexString().slice(0, 6)}`);
    const sideByOrder = new Map<string, string>();
    for (const o of orders) sideByOrder.set(o.id.toString(), o.side);

    const marketTrades = trades
      .filter(t => t.marketId === HACK_MARKET_ID)
      .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
    const lastPrice = marketTrades.length ? marketTrades[marketTrades.length - 1].price : null;
    const prevPrice = marketTrades.length > 1 ? marketTrades[marketTrades.length - 2].price : null;

    const open = orders.filter(o => o.marketId === HACK_MARKET_ID && o.status === 'open' && o.remaining > 0);
    const bids = open.filter(o => o.side === 'buy').map(o => o.price);
    const asks = open.filter(o => o.side === 'sell').map(o => o.price);
    const mid = bids.length && asks.length ? (Math.max(...bids) + Math.min(...asks)) / 2 : (lastPrice ?? 100);

    const qtyByOwner = new Map<string, number>();
    for (const p of positions) if (p.marketId === HACK_MARKET_ID) qtyByOwner.set(p.owner.toHexString(), p.qty);
    let leader: { name: string; net: number } | null = null;
    for (const a of accounts) {
      const key = a.identity.toHexString();
      const net = Number(a.cash) + (qtyByOwner.get(key) ?? 0) * mid;
      if (!leader || net > leader.net) leader = { name: nameByKey.get(key) ?? key.slice(0, 6), net };
    }

    const out: MarqueeItem[] = [];
    if (lastPrice !== null) {
      const move = prevPrice !== null && prevPrice !== lastPrice ? ` ${lastPrice > prevPrice ? '▲' : '▼'}${Math.abs(lastPrice - prevPrice)}` : '';
      out.push({ id: 'px', kind: 'price', label: 'HACK', value: `${lastPrice}${move}` });
    }
    for (const t of marketTrades.slice(-4).reverse()) {
      const side = sideByOrder.get(t.takerOrderId.toString());
      if (!side) continue;
      out.push({ id: `t${t.id}`, kind: side === 'sell' ? 'sell' : 'buy', label: `${nameByKey.get(t.taker.toHexString()) ?? 'Trader'} ${side === 'buy' ? 'bought' : 'sold'} ${t.qty} @`, value: String(t.price) });
    }
    const recent = [...alerts].sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? 1 : -1)).slice(0, 3);
    for (const al of recent) {
      out.push({ id: `a${al.id}`, kind: 'cop', label: `Cop pattern · ${al.kind.replaceAll('_', ' ')} on`, value: nameByKey.get(al.owner.toHexString()) ?? 'a trader' });
    }
    if (news.length) {
      const n = [...news].sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? 1 : -1))[0];
      out.push({ id: 'news', kind: 'news', label: 'News ·', value: n.text });
    }
    if (leader) out.push({ id: 'lead', kind: 'leader', label: `Leader · ${leader.name}`, value: signed(leader.net - START_CASH) });
    out.push({ id: 'cta', kind: 'cta', label: 'Join this market ·', value: '/join' });
    return out;
  }, [orders, trades, accounts, positions, alerts, news]);

  return <Marquee items={items} />;
}

export default function Ticker() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database) : null, [uri, database, validUri]);
  if (!connectionBuilder) return null;
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><TickerInner /></SpacetimeDBProvider>;
}
