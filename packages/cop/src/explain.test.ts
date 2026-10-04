import { describe, expect, it } from 'vitest';
import { detectSpoofing, type CopEvent } from './index';
import { explainWindow } from './explain';

function placed(logId: number, owner: string, side: 'buy' | 'sell', price: number, qty: number, ts: number): CopEvent {
  return { kind: 'order_placed', logId, owner, marketId: 1, orderId: logId, side, price, qty, tif: 'GTC', ts };
}
function cancelled(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'order_cancelled', logId, owner, marketId: 1, orderId, ts };
}
// The owner takes against an unknown resting order (900), which is not in the window.
function trade(logId: number, owner: string, orderId: number, ts: number): CopEvent {
  return { kind: 'trade', logId, marketId: 1, id: logId, maker: 'other', taker: owner,
    makerOrderId: 900, takerOrderId: orderId, price: 100, qty: 1, ts };
}
// Someone else ('o') fills `qty` units of the owner's resting order.
function fill(logId: number, makerOwner: string, makerOrderId: number, qty: number, ts: number): CopEvent {
  return { kind: 'trade', logId, marketId: 1, id: logId, maker: makerOwner, taker: 'o',
    makerOrderId, takerOrderId: 901, price: 102, qty, ts };
}

// The explanation must agree with detectSpoofing: an alert for this owner exists iff all three conditions hold.
function explainAndCheckParity(events: CopEvent[], owner: string, now: number) {
  const explanation = explainWindow(events, owner, now);
  const alerts = detectSpoofing(events, now).filter(alert => alert.owner === owner);
  const { layering, oppositeTrade, cancels } = explanation.conditions;
  expect(layering && oppositeTrade && cancels).toBe(alerts.length > 0);
  return explanation;
}

const SAFE_DEFAULTS = {
  layers: { count: 0, distinctPrices: 0, totalQty: 0, medianQty: 0, side: null },
  oppositeTradeGapMs: null,
  cancelledShare: 0,
  conditions: { layering: false, oppositeTrade: false, cancels: false },
  nextHint: expect.any(String),
};

const FULL_SPOOF: CopEvent[] = [
  placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
  placed(4, 's', 'sell', 100, 1, 1500), trade(5, 's', 4, 1600),
  cancelled(6, 's', 1, 1800), cancelled(7, 's', 2, 1900), cancelled(8, 's', 3, 2000),
];

describe('explainWindow', () => {
  it('reports all three conditions for a full spoof', () => {
    const explanation = explainAndCheckParity(FULL_SPOOF, 's', 2000);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: true, cancels: true });
    expect(explanation.layers).toEqual({ count: 3, distinctPrices: 2, totalQty: 120, medianQty: 40, side: 'buy' });
    expect(explanation.oppositeTradeGapMs).toBe(400);
    expect(explanation.cancelledShare).toBe(1);
    expect(explanation.nextHint).toContain('would flag');
  });

  it('fails the opposite-trade test when the trade comes 4 s after the layers', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
      placed(4, 's', 'sell', 100, 1, 5000), trade(5, 's', 4, 5200),
      cancelled(6, 's', 1, 5300), cancelled(7, 's', 2, 5400), cancelled(8, 's', 3, 5500),
    ];
    const explanation = explainAndCheckParity(events, 's', 6000);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: false, cancels: false });
    expect(explanation.oppositeTradeGapMs).toBe(4000);
    expect(explanation.nextHint).toContain('4.0 s');
    expect(explanation.nextHint).toContain('3 s');
  });

  it('says how many wall orders landed in time when the trade is under 3 s after the last layer', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 98, 40, 1600), placed(3, 's', 'buy', 97, 40, 1700),
      placed(4, 's', 'sell', 100, 1, 4400), trade(5, 's', 4, 4500),
    ];
    const explanation = explainAndCheckParity(events, 's', 4500);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: false, cancels: false });
    expect(explanation.oppositeTradeGapMs).toBe(2800);
    expect(explanation.nextHint).toBe('Only 2 of your wall orders were placed within 3 s before your trade. ' +
      'The Cop needs 3 or more at 2 or more prices.');
  });

  it('fails only the cancel test when half the layered quantity is pulled', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 20, 1000), placed(2, 's', 'buy', 97, 20, 1100), placed(3, 's', 'buy', 97, 40, 1200),
      placed(4, 's', 'sell', 100, 1, 1500), trade(5, 's', 4, 1600),
      cancelled(6, 's', 3, 1800),
    ];
    const explanation = explainAndCheckParity(events, 's', 2000);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: true, cancels: false });
    expect(explanation.cancelledShare).toBe(0.5);
    expect(explanation.nextHint).toContain('50%');
    expect(explanation.nextHint).toContain('80%');
  });

  it('does not flag an honest market maker', () => {
    const maker: CopEvent[] = [
      placed(1, 'mm', 'buy', 98, 5, 1000), placed(2, 'mm', 'sell', 102, 5, 1000),
      placed(3, 'mm', 'sell', 100, 5, 1500), trade(4, 'mm', 3, 1600),
      cancelled(5, 'mm', 1, 2000), cancelled(6, 'mm', 2, 2000),
    ];
    const explanation = explainAndCheckParity(maker, 'mm', 2000);
    expect(explanation.conditions.layering).toBe(false);
    expect(explanation.conditions.oppositeTrade).toBe(false);
    expect(explanation.layers.count).toBe(1);
  });

  it('uses the second trade when only it qualifies', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
      placed(7, 's', 'buy', 99, 1, 1250), trade(5, 's', 7, 1300),
      placed(4, 's', 'sell', 100, 1, 1500), trade(6, 's', 4, 1600),
      cancelled(8, 's', 1, 1800), cancelled(9, 's', 2, 1900), cancelled(10, 's', 3, 2000),
    ];
    const explanation = explainAndCheckParity(events, 's', 2000);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: true, cancels: true });
    expect(detectSpoofing(events, 2000)).toHaveLength(1);
  });

  it('returns safe defaults for an empty event list', () => {
    expect(explainWindow([], 's', 0)).toEqual(SAFE_DEFAULTS);
    expect(detectSpoofing([], 0)).toHaveLength(0);
  });

  it('returns safe defaults for an unknown owner', () => {
    const explanation = explainAndCheckParity(FULL_SPOOF, 'nobody', 2000);
    expect(explanation).toEqual(SAFE_DEFAULTS);
  });

  it('adjusts cancelled quantity for partial fills, matching detectSpoofing', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'sell', 102, 20, 1000), placed(2, 's', 'sell', 103, 20, 1100),
      placed(3, 's', 'sell', 104, 20, 1200), placed(4, 's', 'sell', 105, 20, 1300),
      fill(10, 's', 1, 20, 1400), fill(11, 's', 2, 10, 1450),
      placed(5, 's', 'buy', 101, 1, 1500), trade(6, 's', 5, 1600),
      cancelled(12, 's', 1, 1800), cancelled(13, 's', 2, 1900),
      cancelled(14, 's', 3, 2000), cancelled(15, 's', 4, 2100),
    ];
    const explanation = explainAndCheckParity(events, 's', 2200);
    // Order 1 fully filled (0 pulled), order 2 has 10 left, orders 3 and 4 have 20 each: 50 of 80.
    expect(explanation.cancelledShare).toBe(0.625);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: true, cancels: false });
    expect(detectSpoofing(events, 2200)).toHaveLength(0);
  });

  it('picks sell when buy and sell resting counts tie and there is no trade', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 10, 1000), placed(2, 's', 'buy', 97, 10, 1100),
      placed(3, 's', 'sell', 102, 10, 1200), placed(4, 's', 'sell', 103, 10, 1300),
    ];
    const explanation = explainAndCheckParity(events, 's', 2000);
    expect(explanation.layers.side).toBe('sell');
    expect(explanation.layers.count).toBe(2);
    expect(explanation.conditions.layering).toBe(false);
    expect(explanation.oppositeTradeGapMs).toBeNull();
  });

  it('tells the player to trade when the wall is up but no trade has happened', () => {
    const events: CopEvent[] = [
      placed(1, 's', 'buy', 98, 40, 1000), placed(2, 's', 'buy', 97, 40, 1100), placed(3, 's', 'buy', 97, 40, 1200),
    ];
    const explanation = explainAndCheckParity(events, 's', 2000);
    expect(explanation.conditions).toEqual({ layering: true, oppositeTrade: false, cancels: false });
    expect(explanation.nextHint).toBe('Your wall is up (3 orders, 120 units). ' +
      'Now trade the other way within 3 seconds of placing it.');
  });
});