import { ADAPTIVE_PRIORS, ADAPTIVE_TUNED_PARAMS } from './adaptivePriors';
import { adaptiveStep, DEFAULT_ADAPTIVE_PARAMS, initialAdaptiveState, type AdaptiveState } from './adaptiveTrader';
import { informedOrder } from './informedTrader';
import { marketMakerQuotes } from './marketMaker';
import { noiseOrder } from './noiseTrader';
import type { NewOrder, Rng } from './types';
import { parseNewsHint, stepWorld, worldNews, type DelayedNews, type WorldState } from './world';

// One live bot tick, as pure planning: the same steps apps/runner performs each second (world, delayed news, market
// maker requote, noise, informed, optional adaptive AI), but returned as a plan so the SpacetimeDB module can run the
// bots inside the database on a schedule. The caller executes the plan (cancels, then orders) and stores the new state.

export const LIVE_BOTS = ['market-maker', 'noise-1', 'noise-2', 'noise-3', 'informed', 'adaptive'] as const;
export type LiveBot = typeof LIVE_BOTS[number];
const NOISE: LiveBot[] = ['noise-1', 'noise-2', 'noise-3'];
/** Like the runner's placeBotOrder: a bot at this many open orders cancels them all before placing more. */
const OPEN_ORDER_FLUSH = 18;
const NEWS_EVERY_MS = 10_000;

export interface LiveState {
  world: WorldState;
  lastNewsAt: number;
  pendingNews: DelayedNews[];
  adaptiveEnabled: boolean;
  adaptive: AdaptiveState;
  mids: number[];
}

export interface LiveBotView { owner: string; position: number; cash: number; openOrderIds: number[] }

export interface LiveView {
  now: number;
  marketId: number;
  touch: { bestBid?: number; bestAsk?: number; midPrice: number };
  bots: Partial<Record<LiveBot, LiveBotView>>;
  /** Newest public news row and when it was posted. */
  latestNews?: { text: string; postedAt: number };
}

export interface LiveAction { bot: LiveBot; cancel: number[]; place: NewOrder[] }
export interface LivePlan { actions: LiveAction[]; publishNews: string[]; state: LiveState }

const adaptiveParams = { ...DEFAULT_ADAPTIVE_PARAMS, ...ADAPTIVE_TUNED_PARAMS };

export function initialLiveState(now: number, adaptiveEnabled: boolean): LiveState {
  return { world: { fundamental: 100, now }, lastNewsAt: now, pendingNews: [], adaptiveEnabled,
    adaptive: initialAdaptiveState(ADAPTIVE_PRIORS, adaptiveParams), mids: [] };
}

export function planLiveTick(state: LiveState, view: LiveView, rng: Rng): LivePlan {
  const { now, marketId, touch } = view;
  const world = stepWorld(state.world, now, rng);
  const pendingNews = [...state.pendingNews];
  let lastNewsAt = state.lastNewsAt;
  if (now - lastNewsAt >= NEWS_EVERY_MS) {
    pendingNews.push(worldNews(world, rng));
    lastNewsAt = now;
  }
  const publishNews = pendingNews.filter(n => n.releaseAt <= now).map(n => n.text);
  const stillPending = pendingNews.filter(n => n.releaseAt > now);

  const actions: LiveAction[] = [];
  const act = (bot: LiveBot, place: NewOrder[], cancelAll = false) => {
    const me = view.bots[bot];
    if (!me) return;
    const flush = cancelAll || (place.length > 0 && me.openOrderIds.length >= OPEN_ORDER_FLUSH);
    if (flush || place.length) actions.push({ bot, cancel: flush ? [...me.openOrderIds] : [], place });
  };

  const mm = view.bots['market-maker'];
  if (mm) act('market-maker', marketMakerQuotes({ marketId, owner: mm.owner, midPrice: touch.midPrice, inventory: mm.position }), true);
  for (const bot of NOISE) {
    const me = view.bots[bot];
    if (!me) continue;
    const order = noiseOrder({ marketId, owner: me.owner, ...touch, elapsedMs: 1000 }, rng);
    act(bot, order ? [order] : []);
  }
  const informed = view.bots.informed;
  if (informed) {
    const order = informedOrder({ marketId, owner: informed.owner, fundamental: world.fundamental, ...touch });
    act('informed', order ? [order] : []);
  }

  let adaptive = state.adaptive;
  let mids = state.mids;
  const ai = view.bots.adaptive;
  if (state.adaptiveEnabled && ai) {
    const estimate = view.latestNews ? parseNewsHint(view.latestNews.text) : null;
    const news = estimate !== null && view.latestNews ? { estimate, ageMs: now - view.latestNews.postedAt } : undefined;
    const step = adaptiveStep(adaptive, { marketId, owner: ai.owner, now, ...touch, recentMids: mids, position: ai.position,
      cash: ai.cash, openOrderIds: ai.openOrderIds, news }, rng, adaptiveParams);
    if (step.cancel.length || step.place.length) actions.push({ bot: 'adaptive', cancel: step.cancel, place: step.place });
    adaptive = step.state;
    mids = [...mids, touch.midPrice].slice(-60);
  }

  return { actions, publishNews, state: { world, lastNewsAt, pendingNews: stillPending, adaptiveEnabled: state.adaptiveEnabled, adaptive, mids } };
}
