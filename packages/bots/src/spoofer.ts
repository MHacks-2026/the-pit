import type { NewOrder, Rng, Side } from './types';

/**
 * Adversary bot for the Cop demo (spec section 4). Each cycle:
 *   idle    -> place layered GTC orders on side S, one or more ticks away from the touch
 *   layered -> after layerDelayMs, trade a small IOC on the opposite side at the touch
 *   traded  -> after cancelDelayMs, cancel every open order it has
 *   then cool down for a random cooldownMinMs..cooldownMaxMs.
 * Defaults are sized to satisfy the Cop's spoofing rule (spec section 5) and the engine's risk limits.
 */

export interface SpooferParams {
  layers: number;
  layerQty: number;
  tradeQty: number;
  layerDelayMs: number;
  cancelDelayMs: number;
  cooldownMinMs: number;
  cooldownMaxMs: number;
}

export const DEFAULT_SPOOFER_PARAMS: SpooferParams = {
  layers: 4, layerQty: 20, tradeQty: 2,
  layerDelayMs: 1_000, cancelDelayMs: 1_000,
  cooldownMinMs: 10_000, cooldownMaxMs: 20_000,
};

export type SpooferPhase = 'idle' | 'layered' | 'traded';

export interface SpooferState { phase: SpooferPhase; nextAt: number; layerSide: Side }

export function initialSpooferState(now: number): SpooferState {
  return { phase: 'idle', nextAt: now, layerSide: 'sell' };
}

export interface LayeringInput {
  marketId: number;
  owner: string;
  side: Side;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  layers?: number;
  layerQty?: number;
}

/**
 * The layered "wall": `layers` GTC orders at distinct prices starting one tick behind the touch on `side`.
 * Staying off the touch means the opposite-side trade never hits our own layers (no self-trade).
 * Reused by the web "Try to cheat" button.
 */
export function layeringMacro(input: LayeringInput): NewOrder[] {
  const layers = Math.max(3, Math.min(10, Math.trunc(input.layers ?? DEFAULT_SPOOFER_PARAMS.layers)));
  const qty = Math.max(1, Math.min(50, Math.trunc(input.layerQty ?? DEFAULT_SPOOFER_PARAMS.layerQty)));
  if (!Number.isSafeInteger(input.midPrice) || input.midPrice < 1) return [];
  const orders: NewOrder[] = [];
  for (let i = 0; i < layers; i++) {
    const price = input.side === 'sell'
      ? (input.bestAsk ?? input.midPrice + 1) + 1 + i
      : (input.bestBid ?? input.midPrice - 1) - 1 - i;
    if (price < 1) break;
    orders.push({ marketId: input.marketId, owner: input.owner, side: input.side, price, qty, tif: 'GTC' });
  }
  return orders;
}

export interface SpooferInput {
  marketId: number;
  owner: string;
  now: number;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  /** Ids of this bot's own open orders (the runner reads them from the order table). */
  openOrderIds: readonly number[];
}

export interface SpooferStep { place: NewOrder[]; cancel: number[]; state: SpooferState }

export function spooferStep(state: SpooferState, input: SpooferInput, rng: Rng,
  params: SpooferParams = DEFAULT_SPOOFER_PARAMS): SpooferStep {
  const idle = { place: [], cancel: [], state };
  if (input.now < state.nextAt) return idle;

  if (state.phase === 'idle') {
    const layerSide: Side = rng() < 0.5 ? 'sell' : 'buy';
    const place = layeringMacro({ ...input, side: layerSide, layers: params.layers, layerQty: params.layerQty });
    if (place.length < 3) return idle;
    return { place, cancel: [], state: { phase: 'layered', nextAt: input.now + params.layerDelayMs, layerSide } };
  }

  if (state.phase === 'layered') {
    const side: Side = state.layerSide === 'sell' ? 'buy' : 'sell';
    const touch = side === 'buy' ? (input.bestAsk ?? input.midPrice + 1) : (input.bestBid ?? input.midPrice - 1);
    const qty = Math.max(1, Math.min(50, Math.trunc(params.tradeQty)));
    return {
      place: [{ marketId: input.marketId, owner: input.owner, side, price: Math.max(1, touch), qty, tif: 'IOC' }],
      cancel: [],
      state: { ...state, phase: 'traded', nextAt: input.now + params.cancelDelayMs },
    };
  }

  const span = Math.max(0, params.cooldownMaxMs - params.cooldownMinMs);
  return {
    place: [],
    cancel: [...input.openOrderIds],
    state: { ...state, phase: 'idle', nextAt: input.now + params.cooldownMinMs + Math.floor(rng() * (span + 1)) },
  };
}
