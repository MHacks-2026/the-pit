import type { NewOrder } from './types';

export interface InformedInput {
  marketId: number;
  owner: string;
  fundamental: number;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  threshold?: number;
}

/** Crosses the spread toward the hidden fundamental when |v - mid| >= threshold. Size grows with the gap, capped at 5. */
export function informedOrder(input: InformedInput): NewOrder | null {
  const gap = input.fundamental - input.midPrice;
  if (Math.abs(gap) < (input.threshold ?? 4)) return null;
  const side = gap > 0 ? 'buy' : 'sell';
  const price = side === 'buy' ? (input.bestAsk ?? input.midPrice + 1) : (input.bestBid ?? input.midPrice - 1);
  return { marketId: input.marketId, owner: input.owner, side, price: Math.max(1, Math.trunc(price)), qty: Math.min(5, Math.max(1, Math.trunc(Math.abs(gap) / 2))), tif: 'IOC' };
}
