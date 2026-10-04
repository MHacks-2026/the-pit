import type { CopEvent } from './index';

type Placed = Extract<CopEvent, { kind: 'order_placed' }>;
type Cancelled = Extract<CopEvent, { kind: 'order_cancelled' }>;
type Traded = Extract<CopEvent, { kind: 'trade' }>;
type SelfTrade = Extract<CopEvent, { kind: 'self_trade_attempt' }>;

const WINDOW_MS = 30_000;
const STUFF_WINDOW_MS = 10_000;
const MIN_STUFF_ORDERS = 15;
const WASH_MIN_ATTEMPTS = 2;

export interface QuoteStuffingFinding {
  owner: string;
  orders: number;
  cancelled: number;
  filled: number;
  windowMs: number;
  ts: number;
}

export interface WashFinding {
  owner: string;
  attempts: number;
  orderIds: number[];
  firstTs: number;
  lastTs: number;
  ts: number;
}

// Quote stuffing: >= 15 orders in 10 s, cancel ratio >= 0.9, fill ratio <= 0.1. Integer math only.
export function detectQuoteStuffing(events: readonly CopEvent[], now: number): QuoteStuffingFinding[] {
  const recent = events.filter(event => event.ts >= now - STUFF_WINDOW_MS && event.ts <= now);
  const placed = recent.filter((event): event is Placed => event.kind === 'order_placed');
  const cancels = recent.filter((event): event is Cancelled => event.kind === 'order_cancelled');
  const trades = recent.filter((event): event is Traded => event.kind === 'trade');
  const owners = [...new Set(placed.map(event => event.owner))].sort();

  const findings: QuoteStuffingFinding[] = [];
  for (const owner of owners) {
    const mine = placed.filter(event => event.owner === owner);
    if (mine.length < MIN_STUFF_ORDERS) continue;
    const ids = new Set(mine.map(event => event.orderId));
    const cancelledIds = new Set(
      cancels.filter(event => event.owner === owner && ids.has(event.orderId)).map(event => event.orderId));
    const filledIds = new Set<number>();
    for (const trade of trades) {
      if (trade.maker === owner && ids.has(trade.makerOrderId)) filledIds.add(trade.makerOrderId);
      if (trade.taker === owner && ids.has(trade.takerOrderId)) filledIds.add(trade.takerOrderId);
    }
    const orders = mine.length;
    const cancelled = cancelledIds.size;
    const filled = filledIds.size;
    if (cancelled * 10 >= orders * 9 && filled * 10 <= orders) {
      findings.push({ owner, orders, cancelled, filled, windowMs: STUFF_WINDOW_MS, ts: now });
    }
  }
  return findings;
}

// Wash / self-trade: >= 2 self_trade_attempt events from one owner in the 30 s window.
export function detectWash(events: readonly CopEvent[], now: number): WashFinding[] {
  const attempts = events
    .filter((event): event is SelfTrade =>
      event.kind === 'self_trade_attempt' && event.ts >= now - WINDOW_MS && event.ts <= now)
    .sort((a, b) => a.ts - b.ts || a.logId - b.logId);
  const owners = [...new Set(attempts.map(event => event.owner))].sort();

  const findings: WashFinding[] = [];
  for (const owner of owners) {
    const mine = attempts.filter(event => event.owner === owner);
    if (mine.length < WASH_MIN_ATTEMPTS) continue;
    findings.push({
      owner,
      attempts: mine.length,
      orderIds: mine.map(event => event.orderId),
      firstTs: mine[0].ts,
      lastTs: mine[mine.length - 1].ts,
      ts: now,
    });
  }
  return findings;
}