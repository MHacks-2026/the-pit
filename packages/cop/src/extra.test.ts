import { describe, expect, it } from 'vitest';
import type { CopEvent } from './index';
import { detectQuoteStuffing, detectWash } from './extra';

function placed(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'order_placed', logId, owner, marketId: 1, orderId, side: 'buy', price: 100, qty: 1, tif: 'GTC', ts };
}
function cancelled(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'order_cancelled', logId, owner, marketId: 1, orderId, ts };
}
function fill(logId: number, maker: string, makerOrderId: number, ts: number): CopEvent {
  return { kind: 'trade', logId, marketId: 1, id: logId, maker, taker: 'other', makerOrderId, takerOrderId: 900,
    price: 100, qty: 1, ts };
}
function selfTrade(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'self_trade_attempt', logId, owner, marketId: 1, orderId, ts };
}

// n orders from 'q' over ~1.5 s; the first `cancelCount` are cancelled.
function stuffing(n: number, cancelCount: number): CopEvent[] {
  const events: CopEvent[] = [];
  for (let i = 0; i < n; i++) events.push(placed(i + 1, 'q', i + 1, 1000 + i * 100));
  for (let i = 0; i < cancelCount; i++) events.push(cancelled(100 + i, 'q', i + 1, 2700 + i * 10));
  return events;
}

describe('detectQuoteStuffing', () => {
  it('flags 16 orders with 15 cancelled and no fills', () => {
    const findings = detectQuoteStuffing(stuffing(16, 15), 3000);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ owner: 'q', orders: 16, cancelled: 15, filled: 0 });
  });

  it('tolerates a near-zero fill ratio (1 of 16 filled)', () => {
    const events = [...stuffing(16, 15), fill(200, 'q', 16, 2600)];
    const findings = detectQuoteStuffing(events, 3000);
    expect(findings).toHaveLength(1);
    expect(findings[0].filled).toBe(1);
  });

  it('does not flag fewer than 15 orders', () => {
    expect(detectQuoteStuffing(stuffing(14, 14), 3000)).toEqual([]);
  });

  it('does not flag a low cancel ratio (10 of 16)', () => {
    expect(detectQuoteStuffing(stuffing(16, 10), 3000)).toEqual([]);
  });

  it('does not flag when many orders are filled (3 of 16)', () => {
    const events = [...stuffing(16, 16),
      fill(200, 'q', 1, 2600), fill(201, 'q', 2, 2600), fill(202, 'q', 3, 2600)];
    expect(detectQuoteStuffing(events, 3000)).toEqual([]);
  });

  it('ignores orders older than 10 s', () => {
    expect(detectQuoteStuffing(stuffing(16, 16), 20_000)).toEqual([]);
  });

  it('does not flag an honest market maker (a few quotes, cancel and requote)', () => {
    const maker: CopEvent[] = [
      placed(1, 'mm', 1, 1000), placed(2, 'mm', 2, 1000),
      cancelled(3, 'mm', 1, 2000), cancelled(4, 'mm', 2, 2000),
      placed(5, 'mm', 3, 2000), placed(6, 'mm', 4, 2000),
    ];
    expect(detectQuoteStuffing(maker, 3000)).toEqual([]);
  });

  it('returns nothing for an empty list and does not mutate its input', () => {
    expect(detectQuoteStuffing([], 0)).toEqual([]);
    const events = stuffing(16, 15);
    const copy = [...events];
    detectQuoteStuffing(events, 3000);
    expect(events).toEqual(copy);
  });
});

describe('detectWash', () => {
  it('flags 2 self-trade attempts in 30 s', () => {
    const findings = detectWash([selfTrade(1, 'w', 11, 1000), selfTrade(2, 'w', 12, 5000)], 6000);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ owner: 'w', attempts: 2, orderIds: [11, 12], firstTs: 1000, lastTs: 5000 });
  });

  it('does not flag a single attempt', () => {
    expect(detectWash([selfTrade(1, 'w', 11, 1000)], 6000)).toEqual([]);
  });

  it('does not combine attempts from different owners', () => {
    expect(detectWash([selfTrade(1, 'a', 11, 1000), selfTrade(2, 'b', 12, 2000)], 6000)).toEqual([]);
  });

  it('includes an attempt exactly 30 s old and drops one older than that', () => {
    const events = [selfTrade(1, 'w', 11, 0), selfTrade(2, 'w', 12, 30_000)];
    expect(detectWash(events, 30_000)).toHaveLength(1);
    expect(detectWash(events, 30_001)).toEqual([]);
  });

  it('returns nothing for an empty list', () => {
    expect(detectWash([], 0)).toEqual([]);
  });
});