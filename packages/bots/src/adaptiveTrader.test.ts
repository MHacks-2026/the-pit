import { describe, expect, it } from 'vitest';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import { detectSpoofing, parseEventLog, type CopEvent } from '../../cop/src/index';
import data from '../data/pricePaths.json';
import { ADAPTIVE_PRIORS, ADAPTIVE_TUNED_PARAMS } from './adaptivePriors';
import {
  adaptiveStep, ADAPTIVE_ARMS, armOrders, DEFAULT_ADAPTIVE_PARAMS, epochReward, equityOf, initialAdaptiveState, sampleArm,
  updateArms, type AdaptiveView, type ArmTable,
} from './adaptiveTrader';
import { ADAPTIVE_OWNER, runSession, runStream, seeded } from './streamSim';

const view = (over: Partial<AdaptiveView> = {}): AdaptiveView => ({
  marketId: 1, owner: 'ai', now: 0, midPrice: 100, bestBid: 99, bestAsk: 101, recentMids: [], position: 0, cash: 10_000,
  openOrderIds: [], ...over,
});
const table = (means: number[], weight = 50): ArmTable =>
  Object.fromEntries(ADAPTIVE_ARMS.map((arm, i) => [arm, { weight, mean: means[i], variance: 25 }])) as ArmTable;

describe('bandit math', () => {
  it('updateArms discounts every arm and folds the reward into the chosen one', () => {
    const next = updateArms(table([0, 0, 0, 0, 0], 10), 'revert', 20, { ...DEFAULT_ADAPTIVE_PARAMS, discount: 0.5 });
    expect(next.make.weight).toBe(5);
    expect(next.revert.weight).toBe(6);
    expect(next.revert.mean).toBeCloseTo(20 / 6);
    expect(next.revert.variance).toBeGreaterThanOrEqual(25);
  });

  it('sampleArm is deterministic per seed and favours a clearly better arm', () => {
    const stats = table([-20, -5, 10, 0, -3]);
    expect(sampleArm(stats, seeded(1))).toBe(sampleArm(stats, seeded(1)));
    const picks = Array.from({ length: 200 }, (_, i) => sampleArm(stats, seeded(i)));
    expect(picks.filter(a => a === 'revert').length).toBeGreaterThan(180);
  });

  it('only samples from the allowed arms', () => {
    const stats = table([0, 0, 0, 0, 100]);
    const allowed = ADAPTIVE_ARMS.filter(a => a !== 'news');
    expect(Array.from({ length: 50 }, (_, i) => sampleArm(stats, seeded(i), allowed)).includes('news')).toBe(false);
    expect(initialAdaptiveState({ news: { mean: 9, variance: 1 } }, { ...DEFAULT_ADAPTIVE_PARAMS, arms: allowed }).arm).toBe('make');
  });

  it('forgetting lets it switch when the market changes', () => {
    let stats = table([30, 0, 0, 0, 0], 5);
    for (let i = 0; i < 40; i++) stats = updateArms(stats, 'make', -30);
    expect(Array.from({ length: 100 }, (_, i) => sampleArm(stats, seeded(i))).filter(a => a === 'make').length).toBeLessThan(10);
  });

  it('epochReward separates its own trading from moves on carried shares', () => {
    const start = { equity: 10_000, position: 10, mid: 100 };
    // Held 10 shares through a 5-tick rise and traded nothing: all of the gain is carried, none is the epoch's own trading.
    expect(equityOf({ cash: 9_000, position: 10, midPrice: 105 })).toBe(10_050);
    expect(epochReward(start, { cash: 9_000, position: 10, midPrice: 105 })).toEqual({ total: 50, trading: 0 });
  });

  it('initial state starts on the best prior and respects fixedArm', () => {
    expect(initialAdaptiveState({ make: { mean: -5, variance: 1 }, revert: { mean: 3, variance: 1 } }).arm).toBe('revert');
    expect(initialAdaptiveState({}, { ...DEFAULT_ADAPTIVE_PARAMS, fixedArm: 'flat' }).arm).toBe('flat');
  });
});

describe('armOrders', () => {
  it('make quotes one order per side; momentum and revert trade opposite ways', () => {
    const make = armOrders('make', view());
    expect(make.map(o => o.side).sort()).toEqual(['buy', 'sell']);
    expect(make.every(o => o.tif === 'GTC')).toBe(true);
    const rising = view({ recentMids: [96, 97, 98, 99, 99], midPrice: 100 });
    expect(armOrders('momentum', rising)).toEqual([{ marketId: 1, owner: 'ai', side: 'buy', price: 101, qty: 5, tif: 'IOC' }]);
    expect(armOrders('revert', rising)).toEqual([{ marketId: 1, owner: 'ai', side: 'sell', price: 99, qty: 5, tif: 'IOC' }]);
    expect(armOrders('momentum', view({ recentMids: [100], midPrice: 100 }))).toEqual([]);
  });

  it('news trades toward a fresh public hint that is far enough from the mid', () => {
    const p = { ...DEFAULT_ADAPTIVE_PARAMS, newsThreshold: 4, newsMaxAgeMs: 5_000 };
    expect(armOrders('news', view({ news: { estimate: 106, ageMs: 1_000 } }), p))
      .toEqual([{ marketId: 1, owner: 'ai', side: 'buy', price: 101, qty: 5, tif: 'IOC' }]);
    expect(armOrders('news', view({ news: { estimate: 95, ageMs: 0 } }), p))
      .toEqual([{ marketId: 1, owner: 'ai', side: 'sell', price: 99, qty: 5, tif: 'IOC' }]);
    expect(armOrders('news', view({ news: { estimate: 103, ageMs: 0 } }), p)).toEqual([]); // gap below threshold
    expect(armOrders('news', view({ news: { estimate: 120, ageMs: 6_000 } }), p)).toEqual([]); // stale
    expect(armOrders('news', view(), p)).toEqual([]); // no news yet
    expect(armOrders('news', view({ position: 150, news: { estimate: 120, ageMs: 0 } }), p)).toEqual([]); // at cap
  });

  it('flat unwinds toward zero and every arm respects the position cap', () => {
    expect(armOrders('flat', view({ position: 3 }))).toEqual([{ marketId: 1, owner: 'ai', side: 'sell', price: 99, qty: 3, tif: 'IOC' }]);
    expect(armOrders('flat', view())).toEqual([]);
    const capped = view({ position: 150, recentMids: [90], midPrice: 100 });
    expect(armOrders('momentum', capped)).toEqual([]);
    expect(armOrders('make', capped).map(o => o.side)).toEqual(['sell']);
  });
});

describe('adaptiveStep', () => {
  it('cancels its own orders every tick and scores an epoch after epochMs', () => {
    let state = initialAdaptiveState({}, { ...DEFAULT_ADAPTIVE_PARAMS, fixedArm: 'make' });
    const first = adaptiveStep(state, view({ openOrderIds: [7] }), seeded(1));
    expect(first.cancel).toEqual([7]);
    expect(first.epoch).toBeUndefined();
    state = first.state;
    const later = adaptiveStep(state, view({ now: 10_000, cash: 10_040 }), seeded(1));
    expect(later.epoch).toMatchObject({ arm: 'make', reward: 40, next: 'make' });
  });
});

describe('in the simulator', () => {
  it('runStream output is unchanged by the adaptive option existing', () => {
    expect(runSession({ seed: 3, seconds: 20 }).rows).toEqual(runStream({ seed: 3, seconds: 20 }));
  });

  it('the simulator publishes delayed news the AI can act on, without changing the event log', () => {
    const newsOnly = runSession({ seed: 4, seconds: 120, adaptive: true,
      adaptiveParams: { fixedArm: 'news', newsThreshold: 1, newsMaxAgeMs: 15_000 } });
    const aiOrders = newsOnly.rows.filter(r => r.kind === 'order_placed' && JSON.parse(r.payload).order.owner === ADAPTIVE_OWNER);
    expect(aiOrders.length).toBeGreaterThan(0);
    expect(aiOrders.every(r => JSON.parse(r.payload).order.ts >= 5_000)).toBe(true); // first hint is public at 5 s
  });

  it('accepts a real-data fundamental path and rejects bad ones', () => {
    const path = (data as { paths: number[][] }).paths[0];
    expect(runSession({ seed: 1, seconds: 20, fundamentalPath: path }).rows.length).toBeGreaterThan(0);
    expect(() => runSession({ seed: 1, fundamentalPath: [100, 0] })).toThrow();
  });

  it('the trained AI never trips the Cop and is deterministic (synthetic and real paths)', () => {
    const paths = (data as { paths: number[][] }).paths;
    const sessions = [
      ...Array.from({ length: 15 }, (_, i) => ({ seed: 100 + i })),
      ...[0, 40, 80, 120, 160].map((p, i) => ({ seed: 200 + i, fundamentalPath: paths[p] })),
    ];
    let aiOrders = 0;
    for (const s of sessions) {
      const result = runSession({ ...s, seconds: 120, adaptive: true, adaptiveParams: ADAPTIVE_TUNED_PARAMS, adaptivePriors: ADAPTIVE_PRIORS });
      const events = result.rows.map(parseEventLog).filter((e): e is CopEvent => e !== null);
      for (let now = 0; now <= 150_000; now += 1000) expect(detectSpoofing(events, now)).toEqual([]);
      aiOrders += events.filter(e => e.kind === 'order_placed' && e.owner === ADAPTIVE_OWNER).length;
    }
    expect(aiOrders).toBeGreaterThan(0); // it often stays out (the trained priors favour 'flat'), but it does trade
    const again = () => runSession({ seed: 7, seconds: 60, adaptive: true, adaptivePriors: ADAPTIVE_PRIORS });
    expect(again()).toEqual(again());
  });
});
