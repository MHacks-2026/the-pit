import { marketMakerQuotes } from './marketMaker';
import type { NewOrder, Rng } from './types';

/**
 * Adaptive AI trader: a discounted Thompson-sampling bandit over four simple strategies ("arms").
 * Every epoch it scores the arm it just used (see AdaptiveParams.reward for the two scoring rules), then samples
 * the next arm from each arm's reward estimate. Older epochs are discounted, so it adapts when the market changes.
 * It sees only public information (book touch, recent mids) plus its own position and cash; never the hidden fundamental.
 * It rests at most one order per side, so it cannot layer the book the way the Cop's spoofing rule looks for.
 */

export const ADAPTIVE_ARMS = ['make', 'momentum', 'revert', 'flat'] as const;
export type AdaptiveArm = typeof ADAPTIVE_ARMS[number];

export interface ArmStats { weight: number; mean: number; variance: number }
export type ArmTable = Record<AdaptiveArm, ArmStats>;
export interface ArmPrior { mean: number; variance: number }

export interface AdaptiveParams {
  epochMs: number;
  /** Multiplies every arm's weight each epoch; lower forgets faster. */
  discount: number;
  orderQty: number;
  positionCap: number;
  /** Momentum/revert compare the mid now with the mid this many observations ago. */
  lookback: number;
  /** Minimum mid move (ticks) before momentum/revert act. */
  threshold: number;
  /** Floor on each arm's reward variance (play-dollars squared), so no arm ever looks certain. */
  minVariance: number;
  /** Pseudo-epochs of confidence given to the priors. */
  priorWeight: number;
  /**
   * How an epoch is scored. 'total': change in mark-to-market equity (includes price moves on shares carried in,
   * so an arm can be blamed for a predecessor's inventory). 'trading': that change minus the move on carried shares
   * (fair to the arm, but inventory risk is then charged to nobody). Training picks one on validation data.
   */
  reward: 'total' | 'trading';
  /** For training/evaluation: always play this arm. */
  fixedArm?: AdaptiveArm;
}

export const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  epochMs: 10_000, discount: 0.9, orderQty: 5, positionCap: 150, lookback: 5, threshold: 1, minVariance: 25, priorWeight: 2, reward: 'total',
};

export interface AdaptiveState {
  arm: AdaptiveArm;
  stats: ArmTable;
  /** Snapshot when the current epoch started; undefined until the first step. */
  epoch?: { start: number; equity: number; position: number; mid: number };
}

export interface AdaptiveView {
  marketId: number;
  owner: string;
  now: number;
  midPrice: number;
  bestBid?: number;
  bestAsk?: number;
  /** Previous mids, oldest first, one per tick (not including the current one). */
  recentMids: readonly number[];
  position: number;
  cash: number;
  /** Ids of this bot's own open orders. */
  openOrderIds: readonly number[];
}

export interface AdaptiveStep {
  place: NewOrder[];
  cancel: number[];
  state: AdaptiveState;
  /** Set when an epoch closed: the arm that was scored, its reward under both rules, and the arm chosen next. */
  epoch?: { arm: AdaptiveArm; reward: number; total: number; trading: number; next: AdaptiveArm };
}

export function equityOf(view: Pick<AdaptiveView, 'cash' | 'position' | 'midPrice'>): number {
  return view.cash + view.position * view.midPrice;
}

/** Initial state; with priors the bot starts on the arm with the best prior mean, otherwise on 'make'. */
export function initialAdaptiveState(priors: Partial<Record<AdaptiveArm, ArmPrior>> = {},
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS): AdaptiveState {
  const stats = Object.fromEntries(ADAPTIVE_ARMS.map(arm => {
    const prior = priors[arm];
    return [arm, prior
      ? { weight: params.priorWeight, mean: prior.mean, variance: Math.max(params.minVariance, prior.variance) }
      : { weight: 0, mean: 0, variance: params.minVariance }];
  })) as ArmTable;
  const best = ADAPTIVE_ARMS.reduce((a, b) => (stats[b].weight > 0 && stats[b].mean > stats[a].mean ? b : a), 'make' as AdaptiveArm);
  return { arm: params.fixedArm ?? best, stats };
}

/** Discounts every arm, then folds one reward into the chosen arm (weighted mean and variance). */
export function updateArms(stats: ArmTable, arm: AdaptiveArm, reward: number, params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS): ArmTable {
  const next = Object.fromEntries(ADAPTIVE_ARMS.map(a => [a, { ...stats[a], weight: stats[a].weight * params.discount }])) as ArmTable;
  const s = next[arm];
  const weight = s.weight + 1;
  const delta = reward - s.mean;
  const mean = s.mean + delta / weight;
  const variance = Math.max(params.minVariance, (s.weight * s.variance + delta * (reward - mean)) / weight);
  next[arm] = { weight, mean, variance };
  return next;
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Thompson sampling: draw each arm's mean from N(mean, variance / weight) and pick the largest draw. */
export function sampleArm(stats: ArmTable, rng: Rng): AdaptiveArm {
  let best: AdaptiveArm = ADAPTIVE_ARMS[0];
  let bestDraw = -Infinity;
  for (const arm of ADAPTIVE_ARMS) {
    const s = stats[arm];
    const draw = s.mean + Math.sqrt(s.variance / Math.max(s.weight, 0.05)) * gaussian(rng);
    if (draw > bestDraw) { best = arm; bestDraw = draw; }
  }
  return best;
}

/** Orders for one tick of an arm. Never more than one resting order per side; never past the position cap. */
export function armOrders(arm: AdaptiveArm, view: AdaptiveView, params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS): NewOrder[] {
  const { marketId, owner, position, bestBid, bestAsk } = view;
  const cap = params.positionCap;
  const ioc = (side: 'buy' | 'sell', qty: number): NewOrder[] => {
    const price = side === 'buy' ? bestAsk : bestBid;
    const room = side === 'buy' ? cap - position : cap + position;
    const size = Math.min(qty, room, 50);
    return price !== undefined && size >= 1 ? [{ marketId, owner, side, price, qty: size, tif: 'IOC' }] : [];
  };
  if (arm === 'make') {
    return marketMakerQuotes({ marketId, owner, midPrice: view.midPrice, inventory: position, qty: params.orderQty, inventoryCap: cap });
  }
  if (arm === 'flat') {
    if (position > 0) return ioc('sell', Math.min(params.orderQty, position));
    if (position < 0) return ioc('buy', Math.min(params.orderQty, -position));
    return [];
  }
  const past = view.recentMids[Math.max(0, view.recentMids.length - params.lookback)];
  if (past === undefined) return [];
  const move = view.midPrice - past;
  if (Math.abs(move) < params.threshold) return [];
  const up = move > 0;
  const buy = arm === 'momentum' ? up : !up;
  return ioc(buy ? 'buy' : 'sell', params.orderQty);
}

/** Epoch score under both rules: total equity change, and that change minus the move on shares held at epoch start. */
export function epochReward(start: { equity: number; position: number; mid: number },
  view: Pick<AdaptiveView, 'cash' | 'position' | 'midPrice'>): { total: number; trading: number } {
  const total = equityOf(view) - start.equity;
  return { total, trading: total - start.position * (view.midPrice - start.mid) };
}

/** One tick: close the epoch if due (score, update, resample), cancel own resting orders, then act on the current arm. */
export function adaptiveStep(state: AdaptiveState, view: AdaptiveView, rng: Rng,
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS): AdaptiveStep {
  const snapshot = { start: view.now, equity: equityOf(view), position: view.position, mid: view.midPrice };
  let next: AdaptiveState = state.epoch ? state : { ...state, epoch: snapshot };
  let epoch: AdaptiveStep['epoch'];
  if (state.epoch && view.now - state.epoch.start >= params.epochMs) {
    const scores = epochReward(state.epoch, view);
    const reward = scores[params.reward];
    const stats = updateArms(state.stats, state.arm, reward, params);
    const arm = params.fixedArm ?? sampleArm(stats, rng);
    next = { arm, stats, epoch: snapshot };
    epoch = { arm: state.arm, reward, ...scores, next: arm };
  }
  return { place: armOrders(next.arm, view, params), cancel: [...view.openOrderIds], state: next, ...(epoch ? { epoch } : {}) };
}
