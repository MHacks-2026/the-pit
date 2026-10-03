import type { NewOrder, Rng } from './types';

export interface NoiseInput {
  marketId: number;
  owner: string;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  elapsedMs: number;
  lambdaPerSecond?: number;
}

/** Poisson arrivals; random side; size 1-4; 35% marketable IOC at the touch, otherwise a GTC joining the touch. */
export function noiseOrder(input: NoiseInput, rng: Rng): NewOrder | null {
  const { lambdaPerSecond = 0.5 } = input;
  if (!Number.isSafeInteger(input.midPrice) || input.midPrice < 1 || input.elapsedMs < 0 || lambdaPerSecond < 0) return null;
  if (rng() >= 1 - Math.exp(-lambdaPerSecond * input.elapsedMs / 1000)) return null;
  const side = rng() < 0.5 ? 'buy' : 'sell';
  const qty = 1 + Math.floor(rng() * 4);
  const marketable = rng() < 0.35;
  const touch = side === 'buy' ? input.bestAsk : input.bestBid;
  const price = marketable && touch !== undefined ? touch : side === 'buy' ? (input.bestBid ?? input.midPrice - 1) : (input.bestAsk ?? input.midPrice + 1);
  return { marketId: input.marketId, owner: input.owner, side, price: Math.max(1, Math.trunc(price)), qty, tif: marketable && touch !== undefined ? 'IOC' : 'GTC' };
}
