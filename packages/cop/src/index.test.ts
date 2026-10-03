import { describe, expect, it } from 'vitest';
import { detectSpoofing, parseEventLog, rollingWindow, type CopEvent } from './index';

function placed(logId: number, owner: string, side: 'buy' | 'sell', price: number, qty: number, ts: number): CopEvent {
  return { kind: 'order_placed', logId, owner, marketId: 1, orderId: logId, side, price, qty, tif: 'GTC', ts };
}
function cancelled(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'order_cancelled', logId, owner, marketId: 1, orderId, ts };
}
function trade(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'trade', logId, marketId: 1, id: logId, maker: 'other', taker: owner,
    makerOrderId: 900, takerOrderId: orderId, price: 100, qty: 1, ts };
}

describe('Cop event pipeline', () => {
  it('parseEventLog validates engine payloads and rejects malformed rows', () => {
    const event = placed(1, 's', 'buy', 98, 40, 1000);
    const payload = JSON.stringify({ kind: 'order_placed', order: { id: 1, owner: 's', side: 'buy', price: 98, qty: 40, tif: 'GTC', ts: 1000 } });
    expect(parseEventLog({ id: 1, kind: 'order_placed', marketId: 1, payload })).toEqual(event);
    expect(parseEventLog({ id: 2, kind: 'trade', marketId: 1, payload })).toBeNull();
    expect(parseEventLog({ id: 2, kind: 'trade', marketId: 1, payload: '{' })).toBeNull();
  });

  it('rollingWindow keeps only 30 seconds and preserves log order at one timestamp', () => {
    const events = [placed(2, 'a', 'buy', 99, 1, 30_000), placed(1, 'a', 'buy', 98, 1, 30_000), placed(3, 'a', 'buy', 97, 1, 1)];
    expect(rollingWindow(events, 60_000).map(event => event.logId)).toEqual([1, 2]);
  });

  it('detectSpoofing emits evidence for layers, opposite trade and fast cancellation', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
      placed(4, 's', 'sell', 100, 1, 1500), trade(5, 's', 4, 1600),
      cancelled(6, 's', 1, 1800), cancelled(7, 's', 2, 1900), cancelled(8, 's', 3, 2000),
    ];
    const alerts = detectSpoofing(events, 2000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ owner: 's', kind: 'spoofing', score: 100,
      evidence: { layerOrderIds: [1, 2, 3], oppositeTradeId: 5, cancelledQty: 120, totalLayeredQty: 120 } });
  });

  it('does not flag a market maker or late cancellations', () => {
    const maker: CopEvent[] = [
      placed(1, 'mm', 'buy', 98, 5, 1000), placed(2, 'mm', 'sell', 102, 5, 1000),
      placed(3, 'mm', 'sell', 100, 5, 1500), trade(4, 'mm', 3, 1600),
      cancelled(5, 'mm', 1, 2000), cancelled(6, 'mm', 2, 2000),
    ];
    expect(detectSpoofing(maker, 2000)).toEqual([]);
    const spoofer: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
      placed(4, 's', 'sell', 100, 1, 1500), trade(5, 's', 4, 1600),
      cancelled(6, 's', 1, 7000), cancelled(7, 's', 2, 7000), cancelled(8, 's', 3, 7000),
    ];
    expect(detectSpoofing(spoofer, 7000)).toEqual([]);
  });
});
