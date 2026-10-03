import { describe, expect, it } from 'vitest';
import { marketMakerQuotes, sigmaTicks } from './marketMaker';

const base = { marketId: 1, owner: 'mm', midPrice: 100, inventory: 0 };
const spread = (sigma: number) => {
  const [bid, ask] = marketMakerQuotes({ ...base, sigma });
  return ask.price - bid.price;
};

describe('Avellaneda-Stoikov market maker (T11)', () => {
  it('quotes skew away from inventory: long lowers both quotes, short raises them', () => {
    const flat = marketMakerQuotes({ ...base, sigma: 2 });
    const long = marketMakerQuotes({ ...base, sigma: 2, inventory: 20 });
    const short = marketMakerQuotes({ ...base, sigma: 2, inventory: -20 });
    expect(long[0].price).toBeLessThan(flat[0].price);
    expect(long[1].price).toBeLessThan(flat[1].price);
    expect(short[0].price).toBeGreaterThan(flat[0].price);
    expect(short[1].price).toBeGreaterThan(flat[1].price);
  });

  it('spread widens with volatility', () => {
    expect(spread(0)).toBeLessThan(spread(4));
    expect(spread(4)).toBeLessThan(spread(8));
  });

  it('is deterministic, integer, non-crossing and within engine size limits', () => {
    for (const inventory of [-39, -5, 0, 5, 39]) for (const sigma of [0, 0.5, 3]) {
      const quotes = marketMakerQuotes({ ...base, inventory, sigma, qty: 99 });
      expect(marketMakerQuotes({ ...base, inventory, sigma, qty: 99 })).toEqual(quotes);
      const [bid, ask] = quotes;
      expect(Number.isInteger(bid.price) && Number.isInteger(ask.price)).toBe(true);
      expect(bid.price).toBeLessThan(ask.price);
      expect(bid.price).toBeGreaterThanOrEqual(1);
      expect(quotes.every(q => q.qty === 50 && q.tif === 'GTC')).toBe(true);
    }
  });

  it('drops the side that would grow inventory past the cap', () => {
    expect(marketMakerQuotes({ ...base, inventory: 40 }).map(q => q.side)).toEqual(['sell']);
    expect(marketMakerQuotes({ ...base, inventory: -40 }).map(q => q.side)).toEqual(['buy']);
  });

  it('rejects invalid input instead of throwing', () => {
    expect(marketMakerQuotes({ ...base, midPrice: 100.5 })).toEqual([]);
    expect(marketMakerQuotes({ ...base, gamma: 0 })).toEqual([]);
  });

  it('sigmaTicks measures absolute tick volatility', () => {
    expect(sigmaTicks([100, 100])).toBe(0);
    expect(sigmaTicks([100, 100, 100, 100])).toBe(0);
    expect(sigmaTicks([100, 101, 100, 101, 100])).toBeCloseTo(Math.sqrt(4 / 3), 10);
    expect(sigmaTicks([100, 102, 100, 102, 100], 2)).toBeCloseTo(Math.sqrt(4 / 3), 10);
  });
});
