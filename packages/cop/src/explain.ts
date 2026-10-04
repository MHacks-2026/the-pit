import type { CopEvent } from './index';

type Placed = Extract<CopEvent, { kind: 'order_placed' }>;
type Cancelled = Extract<CopEvent, { kind: 'order_cancelled' }>;
type Traded = Extract<CopEvent, { kind: 'trade' }>;
type Side = 'buy' | 'sell';
type Conditions = { layering: boolean; oppositeTrade: boolean; cancels: boolean };

export interface ExplainResult {
  layers: { count: number; distinctPrices: number; totalQty: number; medianQty: number; side: Side | null };
  oppositeTradeGapMs: number | null;
  cancelledShare: number;
  conditions: Conditions;
  nextHint: string;
}

// Same thresholds as detectSpoofing.
const WINDOW_MS = 30_000;
const LAYER_LOOKBACK_MS = 3_000;
const CANCEL_WINDOW_MS = 5_000;
const MIN_LAYERS = 3;
const MIN_PRICE_LEVELS = 2;
const MIN_MULTIPLE_OF_MEDIAN = 3;

interface Candidate {
  layerSide: Side;
  resting: Placed[];
  within: Placed[];
  gapMs: number | null;
  cancelledShare: number;
  conditions: Conditions;
}

// Local copy of the 30 s window (no runtime import from ./index).
function windowOf(events: readonly CopEvent[], now: number): CopEvent[] {
  return events
    .filter(event => event.ts >= now - WINDOW_MS && event.ts <= now)
    .sort((a, b) => a.ts - b.ts || a.logId - b.logId);
}

// Twice the median, so even-count medians stay integral.
function medianTimesTwo(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? 2 * sorted[Math.floor(mid)] : sorted[mid - 1] + sorted[mid];
}

function totalQty(orders: Placed[]): number {
  return orders.reduce((sum, order) => sum + order.qty, 0);
}

function distinctPrices(orders: Placed[]): number {
  return new Set(orders.map(order => order.price)).size;
}

// total >= 3 * median, checked as 2 * total >= 3 * (2 * median): integers only.
function passesLayering(orders: Placed[], medianX2: number): boolean {
  return orders.length >= MIN_LAYERS && distinctPrices(orders) >= MIN_PRICE_LEVELS &&
    2 * totalQty(orders) >= MIN_MULTIPLE_OF_MEDIAN * medianX2;
}

// Fill-adjusted quantity pulled within 5 s after the trade, same rule as detectSpoofing.
function cancelledQty(layers: Placed[], trade: Traded, owner: string, trades: Traded[], cancellations: Cancelled[]): number {
  let qty = 0;
  for (const layer of layers) {
    const cancel = cancellations.find(event => event.orderId === layer.orderId && event.owner === owner &&
      event.ts >= trade.ts && event.ts <= trade.ts + CANCEL_WINDOW_MS);
    if (!cancel) continue;
    const filled = trades
      .filter(event => event.ts >= layer.ts && event.ts <= cancel.ts &&
        (event.makerOrderId === layer.orderId || event.takerOrderId === layer.orderId))
      .reduce((sum, event) => sum + event.qty, 0);
    qty += Math.max(0, layer.qty - filled);
  }
  return qty;
}

function conditionCount(conditions: Conditions): number {
  return Object.values(conditions).filter(Boolean).length;
}

function hintFor(best: Candidate | undefined, resting: Placed[], side: Side | null, medianX2: number,
  conditions: Conditions): string {
  const label = side ?? 'limit';
  const needed = Math.ceil(MIN_MULTIPLE_OF_MEDIAN * medianX2 / 2);

  if (!conditions.layering) {
    const base = 'You have not built a wall yet. The Cop looks for 3 or more large orders on one side ' +
      'at 2 or more different prices, adding up to at least 3x your usual order size.';
    if (resting.length === 0) return base;
    return `${base} Right now you have ${resting.length} ${label} order(s) at ${distinctPrices(resting)} price(s) ` +
      `totalling ${totalQty(resting)} units (3x your usual size is ${needed}).`;
  }
  if (!best) {
    return `Your wall is up (${resting.length} orders, ${totalQty(resting)} units). ` +
      'Now trade the other way within 3 seconds of placing it.';
  }
  if (!conditions.oppositeTrade) {
    const gap = best.gapMs ?? 0;
    if (gap > LAYER_LOOKBACK_MS) {
      return `You traded ${(gap / 1000).toFixed(1)} s after your last wall order. ` +
        'The Cop only connects them within 3 s.';
    }
    if (best.within.length < MIN_LAYERS || distinctPrices(best.within) < MIN_PRICE_LEVELS) {
      return `Only ${best.within.length} of your wall orders were placed within 3 s before your trade. ` +
        'The Cop needs 3 or more at 2 or more prices.';
    }
    return `The ${best.within.length} wall orders placed within 3 s of your trade total ${totalQty(best.within)} units; ` +
      `the Cop needs at least ${needed} (3x your usual order size).`;
  }
  if (!conditions.cancels) {
    const pct = Math.round(best.cancelledShare * 100);
    return `You have pulled ${pct}% of the wall. The Cop needs 80% cancelled within 5 s of your trade.`;
  }
  return 'The Cop would flag this: layered wall, opposite-side trade, wall pulled.';
}

export function explainWindow(events: readonly CopEvent[], owner: string, now: number): ExplainResult {
  const window = windowOf(events, now);
  const placements = window.filter((event): event is Placed => event.kind === 'order_placed');
  const trades = window.filter((event): event is Traded => event.kind === 'trade');
  const cancellations = window.filter((event): event is Cancelled => event.kind === 'order_cancelled');
  const byOrderId = new Map(placements.map(event => [event.orderId, event]));
  const own = placements.filter(event => event.owner === owner);
  const medianX2 = medianTimesTwo(own.map(event => event.qty));

  const candidates: Candidate[] = [];
  for (const trade of trades) {
    for (const [party, orderId] of [[trade.maker, trade.makerOrderId], [trade.taker, trade.takerOrderId]] as const) {
      if (party !== owner) continue;
      const tradeSide = byOrderId.get(orderId)?.side;
      if (!tradeSide) continue; // placement not in window: skipped, as in detectSpoofing
      const layerSide: Side = tradeSide === 'buy' ? 'sell' : 'buy';
      const resting = own.filter(event => event.marketId === trade.marketId && event.side === layerSide &&
        event.tif === 'GTC' && event.ts <= trade.ts);
      const within = resting.filter(event => event.ts >= trade.ts - LAYER_LOOKBACK_MS);
      const lastPlacedTs = resting.reduce((latest, event) => Math.max(latest, event.ts), -Infinity);
      const withinQty = totalQty(within);
      const cancelled = cancelledQty(within, trade, owner, trades, cancellations);
      candidates.push({
        layerSide, resting, within,
        gapMs: resting.length > 0 ? trade.ts - lastPlacedTs : null,
        cancelledShare: withinQty > 0 ? cancelled / withinQty : 0,
        conditions: {
          layering: passesLayering(resting, medianX2),
          oppositeTrade: passesLayering(within, medianX2),
          cancels: withinQty > 0 && cancelled * 5 >= withinQty * 4,
        },
      });
    }
  }

  // Most conditions wins; ties go to the latest trade (trades are in time order).
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (!best || conditionCount(candidate.conditions) >= conditionCount(best.conditions)) best = candidate;
  }

  let side: Side | null;
  let resting: Placed[];
  if (best) {
    side = best.layerSide;
    resting = best.resting;
  } else {
    const buys = own.filter(event => event.side === 'buy' && event.tif === 'GTC').length;
    const sells = own.filter(event => event.side === 'sell' && event.tif === 'GTC').length;
    side = buys + sells === 0 ? null : sells >= buys ? 'sell' : 'buy'; // tie -> 'sell'
    resting = side ? own.filter(event => event.side === side && event.tif === 'GTC') : [];
  }
  const conditions: Conditions = best?.conditions ??
    { layering: passesLayering(resting, medianX2), oppositeTrade: false, cancels: false };

  return {
    layers: {
      count: resting.length, distinctPrices: distinctPrices(resting), totalQty: totalQty(resting),
      medianQty: medianX2 / 2, side,
    },
    oppositeTradeGapMs: best?.gapMs ?? null,
    cancelledShare: best?.cancelledShare ?? 0,
    conditions,
    nextHint: hintFor(best, resting, side, medianX2, conditions),
  };
}