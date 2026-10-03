import type { NewOrder } from './types';

/** Sample std-dev of mid-price changes, in ticks per sqrt(second). Feed it recent mids sampled every dtSeconds. */
export function sigmaTicks(mids: readonly number[], tick = 1, dtSeconds = 1): number {
  if (mids.length < 3 || tick <= 0 || dtSeconds <= 0) return 0;
  const d: number[] = [];
  for (let i = 1; i < mids.length; i++) d.push((mids[i] - mids[i - 1]) / tick);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const variance = d.reduce((a, x) => a + (x - mean) ** 2, 0) / (d.length - 1);
  return Math.sqrt(variance / dtSeconds);
}

export interface QuoteInput {
  marketId: number;
  owner: string;
  midPrice: number;
  inventory: number;
  /** Volatility in ticks; pass sigmaTicks(recentMids). */
  sigma?: number;
  gamma?: number;
  k?: number;
  secondsToClose?: number;
  inventoryCap?: number;
  qty?: number;
  tick?: number;
}

/**
 * Avellaneda-Stoikov quotes.
 * Reservation r = s - q*gamma*sigma^2*(T-t); total spread = gamma*sigma^2*(T-t) + (2/gamma)ln(1+gamma/k),
 * split evenly around r. Bid rounds down and ask rounds up to the tick, so quotes never cross.
 */
export function marketMakerQuotes(input: QuoteInput): NewOrder[] {
  const { gamma = 0.1, k = 1.5, sigma = 0.8, secondsToClose = 1, inventoryCap = 40, qty = 5, tick = 1 } = input;
  if (!Number.isSafeInteger(input.midPrice) || input.midPrice < 1 || tick < 1 || !Number.isSafeInteger(tick) ||
    gamma <= 0 || k <= 0 || sigma < 0 || secondsToClose < 0 || !Number.isSafeInteger(input.inventory)) return [];
  const risk = gamma * sigma * sigma * secondsToClose;
  const reservation = input.midPrice - input.inventory * risk;
  const halfSpread = (risk + (2 / gamma) * Math.log(1 + gamma / k)) / 2;
  const bid = Math.max(tick, Math.floor((reservation - halfSpread) / tick) * tick);
  const ask = Math.max(bid + tick, Math.ceil((reservation + halfSpread) / tick) * tick);
  const size = Math.max(1, Math.min(50, Math.trunc(qty)));
  const orders: NewOrder[] = [];
  if (input.inventory < inventoryCap) orders.push({ marketId: input.marketId, owner: input.owner, side: 'buy', price: bid, qty: size, tif: 'GTC' });
  if (input.inventory > -inventoryCap) orders.push({ marketId: input.marketId, owner: input.owner, side: 'sell', price: ask, qty: size, tif: 'GTC' });
  return orders;
}
