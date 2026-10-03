import { describe, expect, it } from 'vitest';
import { runStream, seeded, SPOOFER_OWNER, StreamExchange } from './streamSim';

describe('seeded', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = seeded(7), b = seeded(7), c = seeded(8);
    const draws = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(draws);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(draws);
    expect(draws.every(x => x >= 0 && x < 1)).toBe(true);
  });
});

describe('StreamExchange', () => {
  it('logs event_log rows for accepted orders and nothing for rejected ones', () => {
    const ex = new StreamExchange(['a', 'b']);
    ex.place({ marketId: 1, owner: 'a', side: 'sell', price: 100, qty: 5, tif: 'GTC' }, 0);
    ex.place({ marketId: 1, owner: 'b', side: 'buy', price: 100, qty: 2, tif: 'IOC' }, 1);
    expect(ex.log.map(r => r.kind)).toEqual(['order_placed', 'order_placed', 'trade']);
    expect(ex.log.map(r => r.id)).toEqual([1, 2, 3]);
    expect(JSON.parse(ex.log[2].payload).trade).toMatchObject({ maker: 'a', taker: 'b', price: 100, qty: 2 });
    ex.place({ marketId: 1, owner: 'a', side: 'sell', price: 100, qty: 500, tif: 'GTC' }, 2); // over max size: rejected
    expect(ex.log).toHaveLength(3);
    expect(ex.touch()).toEqual({ bestBid: undefined, bestAsk: 100, midPrice: 100 });
  });
});

describe('runStream', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(runStream({ seed: 3, seconds: 20 })).toEqual(runStream({ seed: 3, seconds: 20 }));
    expect(runStream({ seed: 4, seconds: 20 })).not.toEqual(runStream({ seed: 3, seconds: 20 }));
  });

  it('only the spoofer run contains spoofer orders', () => {
    const owners = (spoofer: boolean) => new Set(runStream({ seed: 1, seconds: 20, spoofer })
      .filter(r => r.kind === 'order_placed').map(r => JSON.parse(r.payload).order.owner));
    expect(owners(false).has(SPOOFER_OWNER)).toBe(false);
    expect(owners(true).has(SPOOFER_OWNER)).toBe(true);
  });

  it('accepts requote intervals that do not divide a second and rejects bad options', () => {
    expect(runStream({ seed: 1, seconds: 5, mmRequoteMs: 300 }).length).toBeGreaterThan(0);
    expect(() => runStream({ seed: 1, mmRequoteMs: 0 })).toThrow();
    expect(() => runStream({ seed: 1, mmRequoteMs: 2.5 })).toThrow();
    expect(() => runStream({ seed: 1, seconds: -1 })).toThrow();
  });
});
