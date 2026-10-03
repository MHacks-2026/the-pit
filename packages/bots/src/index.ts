import type { NewOrder } from '@the-pit/engine';

export type Rng = () => number;

export interface QuoteInput {
  marketId: number;
  owner: string;
  midPrice: number;
  inventory: number;
  sigma?: number;
  gamma?: number;
  k?: number;
  secondsToClose?: number;
  inventoryCap?: number;
  qty?: number;
  tick?: number;
}

export function marketMakerQuotes(input: QuoteInput): NewOrder[] {
  const { gamma = 0.1, k = 1.5, sigma = 0.8, secondsToClose = 1, inventoryCap = 40, qty = 5, tick = 1 } = input;
  if (!Number.isSafeInteger(input.midPrice) || input.midPrice < 1 || tick < 1 || !Number.isSafeInteger(tick) ||
    gamma <= 0 || k <= 0 || sigma < 0 || secondsToClose < 0 || !Number.isSafeInteger(input.inventory)) return [];
  const risk = gamma * sigma * sigma * secondsToClose;
  const reservation = input.midPrice - input.inventory * risk;
  const halfSpread = risk + (2 / gamma) * Math.log(1 + gamma / k);
  const bid = Math.max(tick, Math.floor((reservation - halfSpread) / tick) * tick);
  const ask = Math.max(bid + tick, Math.ceil((reservation + halfSpread) / tick) * tick);
  const size = Math.max(1, Math.min(50, Math.trunc(qty)));
  const orders: NewOrder[] = [];
  if (input.inventory < inventoryCap) orders.push({ marketId: input.marketId, owner: input.owner, side: 'buy', price: bid, qty: size, tif: 'GTC' });
  if (input.inventory > -inventoryCap) orders.push({ marketId: input.marketId, owner: input.owner, side: 'sell', price: ask, qty: size, tif: 'GTC' });
  return orders;
}

export interface NoiseInput {
  marketId: number;
  owner: string;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  elapsedMs: number;
  lambdaPerSecond?: number;
}

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

export interface WorldState { fundamental: number; now: number }

export function stepWorld(state: WorldState, nextNow: number, rng: Rng): WorldState {
  if (nextNow <= state.now) return state;
  const steps = Math.max(1, Math.floor((nextNow - state.now) / 1000));
  let fundamental = state.fundamental;
  for (let i = 0; i < steps; i++) {
    const jump = rng() < 0.02 ? 5 : 1;
    fundamental = Math.max(1, fundamental + (rng() < 0.5 ? -jump : jump));
  }
  return { fundamental, now: nextNow };
}

export interface DelayedNews { releaseAt: number; text: string }

export function worldNews(state: WorldState, rng: Rng, delayMs = 5_000): DelayedNews {
  const noisy = state.fundamental + Math.floor(rng() * 11) - 5;
  return {
    releaseAt: state.now + delayMs,
    text: noisy >= 100 ? 'A delayed signal suggests firm HACK demand.' : 'A delayed signal suggests softer HACK demand.',
  };
}

export function informedOrder(input: { marketId: number; owner: string; fundamental: number; midPrice: number; bestBid?: number; bestAsk?: number; threshold?: number }): NewOrder | null {
  const gap = input.fundamental - input.midPrice;
  if (Math.abs(gap) < (input.threshold ?? 4)) return null;
  const side = gap > 0 ? 'buy' : 'sell';
  const price = side === 'buy' ? (input.bestAsk ?? input.midPrice + 1) : (input.bestBid ?? input.midPrice - 1);
  return { marketId: input.marketId, owner: input.owner, side, price: Math.max(1, Math.trunc(price)), qty: Math.min(5, Math.max(1, Math.trunc(Math.abs(gap) / 2))), tif: 'IOC' };
}
