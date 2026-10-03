import { describe, expect, it } from 'vitest';
import { informedOrder } from './informedTrader';
import { stepWorld, worldNews } from './world';

describe('world simulator and informed trader (T17)', () => {
  it('jumps are 5 ticks and happen only on a low draw', () => {
    expect(stepWorld({ fundamental: 100, now: 0 }, 1000, () => 0.01).fundamental).toBe(95);
    expect(stepWorld({ fundamental: 100, now: 0 }, 1000, () => 0.99).fundamental).toBe(101);
  });

  it('steps once per elapsed second and never drops below 1', () => {
    expect(stepWorld({ fundamental: 100, now: 0 }, 3500, () => 0.99).fundamental).toBe(103);
    expect(stepWorld({ fundamental: 2, now: 0 }, 5000, () => 0.01).fundamental).toBe(1);
  });

  it('news is released exactly delayMs later and reflects a noisy fundamental', () => {
    expect(worldNews({ fundamental: 90, now: 7000 }, () => 0.5, 2000)).toEqual({ releaseAt: 9000, text: 'A delayed signal suggests softer HACK demand.' });
    expect(worldNews({ fundamental: 96, now: 0 }, () => 0.99).text).toBe('A delayed signal suggests firm HACK demand.');
  });

  it('informed trader sells into a fundamental below mid and caps size at 5', () => {
    expect(informedOrder({ marketId: 1, owner: 'i', fundamental: 90, midPrice: 100, bestBid: 99 }))
      .toEqual({ marketId: 1, owner: 'i', side: 'sell', price: 99, qty: 5, tif: 'IOC' });
    expect(informedOrder({ marketId: 1, owner: 'i', fundamental: 104, midPrice: 100, threshold: 5 })).toBeNull();
  });
});
