import { describe, expect, it } from 'vitest';
import { marketWatch, type MarketEvent } from './marketWatch';

const created = (id: string, side: 'buy' | 'sell', price: number, amount: number, ts: number): MarketEvent =>
  ({ kind: 'created', id, side, price, amount, ts });
const deleted = (id: string, side: 'buy' | 'sell', price: number, amount: number, ts: number, traded = 0): MarketEvent =>
  ({ kind: 'deleted', id, side, price, amount, traded, ts });
const trade = (id: string, price: number, ts: number, buyOrderId = 'x', sellOrderId = 'y'): MarketEvent =>
  ({ kind: 'trade', id, price, amount: 0.01, buyOrderId, sellOrderId, ts });

// Ten ordinary 0.1 BTC quotes around 100,000, one trade at 100,000, and one 1 BTC order 0.1% away that lasts 800 ms.
const base: MarketEvent[] = [
  ...Array.from({ length: 10 }, (_, i) => created(`q${i}`, i % 2 ? 'sell' : 'buy', 100_000 + (i % 2 ? 5 : -5), 0.1, 1_000 + i)),
  trade('t1', 100_000, 2_000),
  created('big', 'sell', 100_100, 1, 3_000),
  deleted('big', 'sell', 100_100, 1, 3_800),
];

describe('marketWatch', () => {
  it('flags a large order near the price that vanished within seconds without trading', () => {
    const watch = marketWatch(base, 10_000);
    expect(watch.flashOrders).toEqual([{ id: 'big', side: 'sell', price: 100_100, amount: 1, sizeMultiple: 10, livedMs: 800,
      distanceBps: 10, deletedAt: 3_800 }]);
    expect(watch.medianSize).toBe(0.1);
    expect(watch.referencePrice).toBe(100_000);
  });

  it('does not flag orders that traded, lived too long, are small, or sit far from the price', () => {
    const cases: MarketEvent[][] = [
      [...base.slice(0, -1), deleted('big', 'sell', 100_100, 1, 3_800, 0.2)], // partly filled
      [...base.slice(0, -1), deleted('big', 'sell', 100_100, 1, 9_000)], // lived 6 s
      [...base.slice(0, -2), created('big', 'sell', 100_100, 0.2, 3_000), deleted('big', 'sell', 100_100, 0.2, 3_800)], // only 2x
      [...base.slice(0, -2), created('big', 'sell', 101_000, 1, 3_000), deleted('big', 'sell', 101_000, 1, 3_800)], // 100 bp away
      [...base, trade('t2', 100_100, 3_500, 'b', 'big')], // a trade hit it
    ];
    for (const events of cases) expect(marketWatch(events, 10_000).flashOrders).toEqual([]);
  });

  it('needs a reference price, and accepts one from before the window', () => {
    const noTrade = base.filter(e => e.kind !== 'trade');
    expect(marketWatch(noTrade, 10_000).flashOrders).toEqual([]);
    expect(marketWatch(noTrade, 10_000, { referencePrice: 100_000 }).flashOrders.map(f => f.id)).toEqual(['big']);
  });

  it('reports rates and the share of removed orders that never traded, over the window only', () => {
    const events = [...base, deleted('q0', 'buy', 99_995, 0.1, 4_000, 0.1), created('old', 'buy', 99_000, 1, -70_000)];
    const watch = marketWatch(events, 10_000, { windowMs: 10_000 });
    expect(watch.created).toBe(11);
    expect(watch.cancelled).toBe(2);
    expect(watch.trades).toBe(1);
    expect(watch.perSecond).toEqual({ orders: 1.1, cancels: 0.2, trades: 0.1 });
    expect(watch.cancelledUntradedShare).toBe(0.5);
  });

  it('handles an empty window', () => {
    expect(marketWatch([], 0)).toMatchObject({ created: 0, cancelled: 0, trades: 0, cancelledUntradedShare: null,
      medianSize: null, referencePrice: null, flashOrders: [] });
  });
});
