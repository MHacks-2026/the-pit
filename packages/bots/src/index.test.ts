import { describe, expect, it } from 'vitest';
import { informedOrder, marketMakerQuotes, noiseOrder, stepWorld, worldNews } from './index';

describe('pure bot strategies', () => {
  it('marketMakerQuotes produces integer two-sided quotes and respects inventory cap', () => {
    const input = { marketId: 1, owner: 'mm', midPrice: 100, inventory: 0 };
    const quotes = marketMakerQuotes(input);
    expect(quotes.map(q => q.side)).toEqual(['buy', 'sell']);
    expect(quotes[0].price).toBeLessThan(quotes[1].price);
    expect(quotes.every(q => Number.isInteger(q.price) && Number.isInteger(q.qty))).toBe(true);
    expect(marketMakerQuotes({ ...input, inventory: 40 }).map(q => q.side)).toEqual(['sell']);
  });

  it('noiseOrder uses injected draws for arrival, side, size and aggression', () => {
    const values = [0, 0.1, 0.5, 0.1];
    const order = noiseOrder({ marketId: 1, owner: 'noise', midPrice: 100, bestAsk: 102, elapsedMs: 1000 }, () => values.shift()!);
    expect(order).toMatchObject({ side: 'buy', price: 102, qty: 3, tif: 'IOC' });
    expect(noiseOrder({ marketId: 1, owner: 'noise', midPrice: 100, elapsedMs: 1000 }, () => 0.99)).toBeNull();
  });

  it('stepWorld is deterministic with injected time and draws', () => {
    const values = [0.5, 0.8, 0.5, 0.1];
    expect(stepWorld({ fundamental: 100, now: 0 }, 2000, () => values.shift()!)).toEqual({ fundamental: 100, now: 2000 });
    expect(stepWorld({ fundamental: 100, now: 1000 }, 1000, () => 0)).toEqual({ fundamental: 100, now: 1000 });
  });

  it('worldNews delays a noisy fair-value hint', () => {
    expect(worldNews({ fundamental: 102, now: 1000 }, () => 0.5)).toEqual({ releaseAt: 6000, text: 'Delayed estimate: HACK fair value about 102.' });
  });

  it('informedOrder trades toward a large fundamental gap', () => {
    expect(informedOrder({ marketId: 1, owner: 'i', fundamental: 101, midPrice: 100 })).toBeNull();
    expect(informedOrder({ marketId: 1, owner: 'i', fundamental: 108, midPrice: 100, bestAsk: 102 })).toMatchObject({ side: 'buy', price: 102, qty: 4, tif: 'IOC' });
  });
});
