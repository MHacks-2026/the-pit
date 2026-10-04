// Market watch: the Cop's warning signs measured on a real, public order-by-order feed.
// Public feeds carry order ids but never account ids, so the spoofing rule (which needs "the same account") cannot run.
// What can be seen without identities is phantom liquidity: large orders that appear near the price and vanish within
// seconds without trading, plus how much of the market's quoting is cancelled without ever trading. These are signals,
// not accusations. Prices and sizes are the venue's real (decimal) values; this module only observes, it never trades.

type Side = 'buy' | 'sell';

export type MarketEvent =
  | { kind: 'created'; id: string; side: Side; price: number; amount: number; ts: number }
  | { kind: 'changed'; id: string; side: Side; price: number; amount: number; traded: number; ts: number }
  | { kind: 'deleted'; id: string; side: Side; price: number; amount: number; traded: number; ts: number }
  | { kind: 'trade'; id: string; price: number; amount: number; buyOrderId: string; sellOrderId: string; ts: number };

export interface FlashOrder {
  id: string;
  side: Side;
  price: number;
  amount: number;
  /** Size relative to the median order size in the window (the Cop's ">= 3x median" rule). */
  sizeMultiple: number;
  livedMs: number;
  /** Distance from the last trade price, in basis points (1 bp = 0.01%). */
  distanceBps: number;
  deletedAt: number;
}

export interface MarketWatch {
  windowMs: number;
  created: number;
  cancelled: number;
  trades: number;
  perSecond: { orders: number; cancels: number; trades: number };
  /** Share of orders removed in the window that never traded at all. */
  cancelledUntradedShare: number | null;
  medianSize: number | null;
  referencePrice: number | null;
  flashOrders: FlashOrder[];
}

export interface MarketWatchOptions {
  windowMs?: number;
  /** A flash order is gone within this long... */
  maxLifeMs?: number;
  /** ...is at least this many times the median order size... */
  sizeMultiple?: number;
  /** ...and was placed within this many basis points of the last trade price. */
  nearBps?: number;
  /** Last trade price seen before the window, if the window itself has no trade. */
  referencePrice?: number;
  maxFlashOrders?: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Rolling summary of the last `windowMs` of events. Pure: same events and clock give the same result. */
export function marketWatch(events: readonly MarketEvent[], now: number, options: MarketWatchOptions = {}): MarketWatch {
  const { windowMs = 60_000, maxLifeMs = 5_000, sizeMultiple = 3, nearBps = 50, maxFlashOrders = 8 } = options;
  const window = events.filter(e => e.ts > now - windowMs && e.ts <= now).sort((a, b) => a.ts - b.ts);
  const created = new Map<string, Extract<MarketEvent, { kind: 'created' }>>();
  const tradedIds = new Set<string>();
  const trades: Extract<MarketEvent, { kind: 'trade' }>[] = [];
  const deleted: Extract<MarketEvent, { kind: 'deleted' }>[] = [];
  for (const e of window) {
    if (e.kind === 'created') created.set(e.id, e);
    else if (e.kind === 'trade') { trades.push(e); tradedIds.add(e.buyOrderId); tradedIds.add(e.sellOrderId); }
    else if (e.kind === 'changed') { if (e.traded > 0) tradedIds.add(e.id); }
    else deleted.push(e);
  }
  const medianSize = median([...created.values()].map(e => e.amount));
  const untraded = deleted.filter(e => e.traded === 0 && !tradedIds.has(e.id));
  const seconds = windowMs / 1000;
  const rate = (n: number) => Math.round((n / seconds) * 10) / 10;

  const flashOrders: FlashOrder[] = [];
  let tradeIndex = 0;
  let reference = options.referencePrice ?? null;
  for (const del of deleted) {
    while (tradeIndex < trades.length && trades[tradeIndex].ts <= del.ts) reference = trades[tradeIndex++].price;
    const placed = created.get(del.id);
    if (!placed || reference === null || medianSize === null || medianSize <= 0) continue;
    if (del.traded > 0 || tradedIds.has(del.id)) continue;
    const livedMs = del.ts - placed.ts;
    const multiple = placed.amount / medianSize;
    const distanceBps = (Math.abs(placed.price - reference) / reference) * 10_000;
    if (livedMs < 0 || livedMs > maxLifeMs || multiple < sizeMultiple || distanceBps > nearBps) continue;
    flashOrders.push({ id: del.id, side: placed.side, price: placed.price, amount: placed.amount,
      sizeMultiple: Math.round(multiple * 10) / 10, livedMs: Math.round(livedMs), distanceBps: Math.round(distanceBps * 10) / 10,
      deletedAt: del.ts });
  }
  const lastTrade = trades.length ? trades[trades.length - 1].price : options.referencePrice ?? null;
  return {
    windowMs,
    created: created.size,
    cancelled: deleted.length,
    trades: trades.length,
    perSecond: { orders: rate(created.size), cancels: rate(deleted.length), trades: rate(trades.length) },
    cancelledUntradedShare: deleted.length ? untraded.length / deleted.length : null,
    medianSize,
    referencePrice: lastTrade,
    flashOrders: flashOrders.reverse().slice(0, maxFlashOrders),
  };
}
