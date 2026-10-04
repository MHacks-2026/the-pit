import { describe, expect, it } from 'vitest';
import { auditSnapshot, type AuditSnapshot } from './audit';

function validSnapshot(): AuditSnapshot {
  const sell = { id: 1, owner: 'maker', marketId: 1, side: 'sell', price: 100, qty: 2, remaining: 1, status: 'open' };
  const buy = { id: 2, owner: 'taker', marketId: 1, side: 'buy', price: 100, qty: 1, remaining: 0, status: 'filled' };
  const trade = { id: 3, marketId: 1, price: 100, qty: 1, maker: 'maker', taker: 'taker', makerOrderId: 1, takerOrderId: 2 };
  return {
    accounts: [{ owner: 'maker', cash: 10_100n }, { owner: 'taker', cash: 9_900n }],
    positions: [{ owner: 'maker', marketId: 1, qty: -1 }, { owner: 'taker', marketId: 1, qty: 1 }],
    orders: [sell, buy], trades: [trade],
    events: [
      { id: 4, kind: 'order_placed', marketId: 1, payload: JSON.stringify({ kind: 'order_placed', order: { ...sell, tif: 'GTC', ts: 1 } }) },
      { id: 5, kind: 'order_placed', marketId: 1, payload: JSON.stringify({ kind: 'order_placed', order: { ...buy, tif: 'GTC', ts: 2 } }) },
      { id: 6, kind: 'trade', marketId: 1, payload: JSON.stringify({ kind: 'trade', trade: { ...trade, ts: 2 } }) },
    ],
    alerts: [],
  };
}

describe('auditSnapshot', () => {
  it('accepts a consistent trade snapshot', () => {
    expect(auditSnapshot(validSnapshot())).toEqual([]);
  });

  it('finds cash, position, fill, and event inconsistencies without changing the input', () => {
    const snapshot = validSnapshot();
    snapshot.accounts[0].cash -= 1n;
    snapshot.positions[1].qty = 2;
    snapshot.orders[0].remaining = 2;
    snapshot.events.pop();
    const before = structuredClone(snapshot);
    expect(auditSnapshot(snapshot).map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CASH', 'POSITION', 'ORDER_FILLS', 'TRADE_EVENT_COUNT',
    ]));
    expect(snapshot).toEqual(before);
  });

  it('checks spoofing evidence against recorded orders, cancellation, and trade', () => {
    const snapshot = validSnapshot();
    snapshot.alerts.push({ id: 7, owner: 'maker', kind: 'spoofing', evidence: JSON.stringify({
      layerOrderIds: [999], cancelledOrderIds: [999], oppositeTradeId: 999,
    }) });
    expect(auditSnapshot(snapshot)).toContainEqual({ code: 'ALERT_EVIDENCE', detail: expect.stringContaining('alert 7') });
  });
});
