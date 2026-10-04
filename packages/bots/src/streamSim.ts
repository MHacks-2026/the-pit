import { cancelOrder, matchOrder, type Book, type MatchResult, type NewOrder } from '@the-pit/engine';
import { informedOrder } from './informedTrader';
import { marketMakerQuotes } from './marketMaker';
import { noiseOrder } from './noiseTrader';
import { DEFAULT_SPOOFER_PARAMS, initialSpooferState, spooferStep, type SpooferParams } from './spoofer';
import type { Rng } from './types';
import { stepWorld } from './world';

/** One Spacetime event_log row; same shape as EventLogInput in @the-pit/cop (payload = JSON.stringify(EngineEvent)). */
export interface EventLogRow { id: number; kind: string; marketId: number; payload: string }

export const SPOOFER_OWNER = 'spoofer';
const NOISE_OWNERS = ['noise-1', 'noise-2', 'noise-3'];
// Runner's default bot set (PIT_BOT_COUNT=3).
export const STREAM_OWNERS = ['mm', ...NOISE_OWNERS, 'informed'];

/** Deterministic mulberry32 rng in [0, 1). */
export function seeded(seed: number): Rng {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny in-memory exchange on the real engine. Logs event_log rows exactly as the Spacetime module writes them. */
export class StreamExchange {
  book: Book;
  /** A rejected order rolls back in the module and logs nothing. */
  log: EventLogRow[] = [];
  private id = 1;
  constructor(owners: string[]) {
    this.book = { orders: [], lastTradePrice: {},
      accounts: Object.fromEntries(owners.map(owner => [owner, { cash: 1_000_000, positions: {} }])) };
  }
  protected apply(result: MatchResult) {
    this.book = result.book;
    if (result.events.some(e => e.kind === 'rejected')) return;
    for (const e of result.events) this.log.push({ id: this.log.length + 1, kind: e.kind, marketId: 1, payload: JSON.stringify(e) });
  }
  ctx(now: number) { return { now, nextId: () => this.id++ }; }
  place(order: NewOrder, now: number) { this.apply(matchOrder(this.book, order, this.ctx(now))); }
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

export interface StreamOptions {
  seed: number;
  seconds?: number;
  /** Adds the Spoofer (owner SPOOFER_OWNER). It has its own rng, so the other bots draw the same numbers either way. */
  spoofer?: boolean;
  /** Overrides for the Spoofer's defaults, e.g. { layerDelayMs: 4000 } for an evasive variant. Ignored without spoofer. */
  spooferParams?: Partial<SpooferParams>;
  /** How often the MM cancels and requotes. Everything else ticks once per second, like apps/runner. */
  mmRequoteMs?: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Runs the real bots through matchOrder and returns the event_log rows. Same options give the same rows. */
export function runStream({ seed, seconds = 60, spoofer = false, spooferParams, mmRequoteMs = 1000 }: StreamOptions): EventLogRow[] {
  if (!Number.isSafeInteger(mmRequoteMs) || mmRequoteMs < 1) throw new Error('mmRequoteMs must be a positive integer');
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('seconds must be a non-negative integer');
  const sim = new StreamExchange([...STREAM_OWNERS, SPOOFER_OWNER]);
  const rng = seeded(seed);
  const spooferRng = seeded(seed + 1000);
  const stepMs = gcd(1000, mmRequoteMs);
  let world = { fundamental: 100, now: 0 };
  const spoofParams = { ...DEFAULT_SPOOFER_PARAMS, ...spooferParams };
  let spoof = initialSpooferState(3000);
  for (let now = 0; now <= seconds * 1000; now += stepMs) {
    if (now % mmRequoteMs === 0) sim.requoteMaker(now);
    if (now % 1000 !== 0) continue;
    world = stepWorld(world, now, rng);
    for (const owner of NOISE_OWNERS) {
      const order = noiseOrder({ marketId: 1, owner, ...sim.touch(), elapsedMs: 1000 }, rng);
      if (order) sim.place(order, now);
    }
    const informed = informedOrder({ marketId: 1, owner: 'informed', fundamental: world.fundamental, ...sim.touch() });
    if (informed) sim.place(informed, now);
    if (spoofer) {
      const step = spooferStep(spoof, { marketId: 1, owner: SPOOFER_OWNER, now, ...sim.touch(), openOrderIds: sim.open(SPOOFER_OWNER).map(o => o.id) }, spooferRng, spoofParams);
      for (const order of step.place) sim.place(order, now);
      for (const id of step.cancel) sim.cancel(id, SPOOFER_OWNER, now);
      spoof = step.state;
    }
  }
  return sim.log;
}
