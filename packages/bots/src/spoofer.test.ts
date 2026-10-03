import { describe, expect, it } from 'vitest';
import { cancelOrder, matchOrder, type Book, type EngineEvent, type MatchResult } from '@the-pit/engine';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import { detectSpoofing, type CopEvent } from '../../cop/src/index';
import { marketMakerQuotes } from './marketMaker';
import { noiseOrder } from './noiseTrader';
import { DEFAULT_SPOOFER_PARAMS, initialSpooferState, layeringMacro, spooferStep, type SpooferState } from './spoofer';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny in-memory exchange: real engine + engine events translated to the Cop's event shape. */
class Sim {
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

describe('layeringMacro', () => {
  it('builds >= 3 GTC layers at distinct prices behind the touch', () => {
    const sells = layeringMacro({ marketId: 1, owner: 's', side: 'sell', midPrice: 100, bestBid: 99, bestAsk: 101 });
    expect(sells.map(o => o.price)).toEqual([102, 103, 104, 105]);
    expect(sells.every(o => o.side === 'sell' && o.qty === 20 && o.tif === 'GTC')).toBe(true);
    const buys = layeringMacro({ marketId: 1, owner: 's', side: 'buy', midPrice: 100, bestBid: 99, layers: 3, layerQty: 80 });
    expect(buys.map(o => [o.price, o.qty])).toEqual([[98, 50], [97, 50], [96, 50]]);
  });
});

describe('spooferStep state machine (T19)', () => {
  const input = { marketId: 1, owner: 's', midPrice: 100, bestBid: 99, bestAsk: 101 };

  it('layers, then trades the opposite side, then cancels everything and cools down', () => {
    const rng = () => 0.1; // < 0.5 -> sell layers
    let state: SpooferState = initialSpooferState(0);
    const a = spooferStep(state, { ...input, now: 0, openOrderIds: [] }, rng);
    expect(a.place).toHaveLength(4);
    expect(a.state).toEqual({ phase: 'layered', nextAt: 1000, layerSide: 'sell' });
    state = a.state;
    expect(spooferStep(state, { ...input, now: 500, openOrderIds: [1, 2, 3, 4] }, rng)).toEqual({ place: [], cancel: [], state });
    const b = spooferStep(state, { ...input, now: 1000, openOrderIds: [1, 2, 3, 4] }, rng);
    expect(b.place).toEqual([{ marketId: 1, owner: 's', side: 'buy', price: 101, qty: 2, tif: 'IOC' }]);
    const c = spooferStep(b.state, { ...input, now: 2000, openOrderIds: [1, 2, 3, 4] }, rng);
    expect(c.cancel).toEqual([1, 2, 3, 4]);
    expect(c.state.phase).toBe('idle');
    expect(c.state.nextAt).toBe(2000 + 10_000 + Math.floor(0.1 * 10_001));
  });

  it('respects engine risk limits', () => {
    const p = DEFAULT_SPOOFER_PARAMS;
    expect(p.layers).toBeLessThanOrEqual(20);
    expect(Math.max(p.layerQty, p.tradeQty)).toBeLessThanOrEqual(50);
    expect(p.layers * p.layerQty).toBeGreaterThanOrEqual(3 * p.layerQty); // Cop: total >= 3x median
    expect(p.layerDelayMs).toBeLessThan(3_000);                           // Cop: trade within 3 s of layers
    expect(p.cancelDelayMs).toBeLessThan(5_000);                          // Cop: cancel within 5 s of trade
  });
});

describe('end-to-end with the real engine and Cop', () => {
  function run(withSpoofer: boolean, seed: number, seconds = 60) {
    const sim = new Sim(['mm', 'noise', 's']);
    const rng = seeded(seed);
    let spoof = initialSpooferState(3000);
    const alerts = new Map<string, string>();
    for (let now = 0; now <= seconds * 1000; now += 500) {
      if (now % 1000 === 0) sim.requoteMaker(now);
      const n = noiseOrder({ marketId: 1, owner: 'noise', ...sim.touch(), elapsedMs: 500, lambdaPerSecond: 1 }, rng);
      if (n) sim.place(n, now);
      if (withSpoofer) {
        const step = spooferStep(spoof, { marketId: 1, owner: 's', now, ...sim.touch(), openOrderIds: sim.open('s').map(o => o.id) }, rng);
        for (const order of step.place) sim.place(order, now);
        for (const id of step.cancel) sim.cancel(id, 's', now);
        spoof = step.state;
      }
      for (const alert of detectSpoofing(sim.events, now)) alerts.set(alert.evidence.incidentKey, alert.owner);
    }
    return { alerts: [...alerts.values()], sim };
  }

  it('the Cop flags the Spoofer on every cycle across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { alerts, sim } = run(true, seed);
      // One cycle = one opposite-side IOC that actually traded.
      const cycles = new Set(sim.events.flatMap(e => e.kind === 'trade' && e.taker === 's' ? [e.takerOrderId] : [])).size;
      expect(cycles).toBeGreaterThanOrEqual(2);
      expect(alerts.filter(owner => owner === 's')).toHaveLength(cycles);
      expect(alerts.every(owner => owner === 's')).toBe(true);
    }
  });

  it('negative control: Market Maker and noise are never flagged', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(run(false, seed).alerts).toEqual([]);
  });
});
