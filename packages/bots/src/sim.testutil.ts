import { cancelOrder, matchOrder, type Book, type EngineEvent, type MatchResult } from '@the-pit/engine';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import type { CopEvent } from '../../cop/src/index';
import { marketMakerQuotes } from './marketMaker';

export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny in-memory exchange: real engine + engine events translated to the Cop's event shape. */
export class Sim {
  book: Book;
  events: CopEvent[] = [];
  private id = 1;
  private logId = 1;
  constructor(owners: string[]) {
    this.book = { orders: [], lastTradePrice: {},
      accounts: Object.fromEntries(owners.map(owner => [owner, { cash: 1_000_000, positions: {} }])) };
  }
  private apply(result: MatchResult) {
    this.book = result.book;
    for (const e of result.events) this.events.push(...this.toCop(e));
  }
  private toCop(e: EngineEvent): CopEvent[] {
    const logId = this.logId++;
    if (e.kind === 'order_placed') return [{ kind: 'order_placed', logId, owner: e.order.owner, marketId: 1, orderId: e.order.id,
      side: e.order.side, price: e.order.price, qty: e.order.qty, tif: e.order.tif, ts: e.order.ts }];
    if (e.kind === 'order_cancelled') return [{ kind: 'order_cancelled', logId, owner: e.owner, marketId: 1, orderId: e.orderId, ts: e.ts }];
    if (e.kind === 'trade') return [{ kind: 'trade', logId, ...e.trade }];
    if (e.kind === 'self_trade_attempt') return [{ kind: 'self_trade_attempt', logId, owner: e.owner, marketId: 1, orderId: e.orderId, ts: e.ts }];
    return [];
  }
  ctx(now: number) { return { now, nextId: () => this.id++ }; }
  place(order: Parameters<typeof matchOrder>[1], now: number) { this.apply(matchOrder(this.book, order, this.ctx(now))); }
  cancel(orderId: number, owner: string, now: number) { this.apply(cancelOrder(this.book, orderId, owner, this.ctx(now))); }
  open(owner: string) { return this.book.orders.filter(o => o.owner === owner && o.status === 'open' && o.remaining > 0); }
  touch() {
    const live = this.book.orders.filter(o => o.status === 'open' && o.remaining > 0);
    const bids = live.filter(o => o.side === 'buy').map(o => o.price);
    const asks = live.filter(o => o.side === 'sell').map(o => o.price);
    const bestBid = bids.length ? Math.max(...bids) : undefined;
    const bestAsk = asks.length ? Math.min(...asks) : undefined;
    const midPrice = bestBid !== undefined && bestAsk !== undefined ? Math.round((bestBid + bestAsk) / 2) : 100;
    return { bestBid, bestAsk, midPrice };
  }
  requoteMaker(now: number) {
    for (const o of this.open('mm')) this.cancel(o.id, 'mm', now);
    const inventory = this.book.accounts.mm.positions[1]?.qty ?? 0;
    for (const q of marketMakerQuotes({ marketId: 1, owner: 'mm', midPrice: this.touch().midPrice, inventory })) this.place(q, now);
  }
}
