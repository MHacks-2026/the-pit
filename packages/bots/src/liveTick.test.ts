import { describe, expect, it } from 'vitest';
import { initialLiveState, planLiveTick, type LiveBot, type LiveView } from './liveTick';
import { seeded } from './streamSim';

const bots = (open: Partial<Record<LiveBot, number[]>> = {}) => Object.fromEntries(
  (['market-maker', 'noise-1', 'noise-2', 'noise-3', 'informed', 'adaptive'] as LiveBot[])
    .map(bot => [bot, { owner: `hex-${bot}`, position: 0, cash: 10_000, openOrderIds: open[bot] ?? [] }]));
const view = (now: number, over: Partial<LiveView> = {}): LiveView =>
  ({ now, marketId: 1, touch: { bestBid: 99, bestAsk: 101, midPrice: 100 }, bots: bots(), ...over });

describe('planLiveTick', () => {
  it('is deterministic for the same state, view and rng', () => {
    const state = initialLiveState(0, true);
    expect(planLiveTick(state, view(1000), seeded(5))).toEqual(planLiveTick(state, view(1000), seeded(5)));
  });

  it('requotes the market maker every tick: cancels its open orders, then posts two-sided quotes', () => {
    const plan = planLiveTick(initialLiveState(0, false), view(1000, { bots: bots({ 'market-maker': [7, 8] }) }), seeded(1));
    const mm = plan.actions.find(a => a.bot === 'market-maker')!;
    expect(mm.cancel).toEqual([7, 8]);
    expect(mm.place.map(o => o.side).sort()).toEqual(['buy', 'sell']);
    expect(mm.place.every(o => o.owner === 'hex-market-maker' && o.tif === 'GTC')).toBe(true);
  });

  it('a bot with 18+ open orders cancels them all before placing (like the runner)', () => {
    const many = Array.from({ length: 18 }, (_, i) => i + 1);
    let found = false;
    for (let seed = 1; seed < 50 && !found; seed++) {
      const plan = planLiveTick(initialLiveState(0, false), view(1000, { bots: bots({ 'noise-1': many }) }), seeded(seed));
      const noise = plan.actions.find(a => a.bot === 'noise-1');
      if (noise?.place.length) { expect(noise.cancel).toEqual(many); found = true; }
    }
    expect(found).toBe(true);
  });

  it('posts a fair-value hint every 10 s and publishes it 5 s later', () => {
    let state = initialLiveState(0, false);
    const published: [number, string][] = [];
    for (let now = 1000; now <= 31_000; now += 1000) {
      const plan = planLiveTick(state, view(now), seeded(now));
      for (const text of plan.publishNews) published.push([now, text]);
      state = plan.state;
    }
    expect(published.map(([t]) => t)).toEqual([15_000, 25_000]);
    expect(published.every(([, text]) => /^Delayed estimate: HACK fair value about \d+\.$/.test(text))).toBe(true);
  });

  it('runs the adaptive AI only when enabled, and never places anything for absent bots', () => {
    const off = planLiveTick(initialLiveState(0, false), view(1000), seeded(2));
    expect(off.actions.some(a => a.bot === 'adaptive')).toBe(false);
    let state = initialLiveState(0, true);
    for (let now = 1000; now <= 20_000; now += 1000) state = planLiveTick(state, view(now), seeded(now)).state;
    expect(state.mids.length).toBe(20);
    const onlyMm = planLiveTick(initialLiveState(0, true), view(1000, { bots: { 'market-maker': bots()['market-maker'] } }), seeded(3));
    expect(onlyMm.actions.map(a => a.bot)).toEqual(['market-maker']);
  });

  it('every planned order is owned by its bot and within engine size limits', () => {
    let state = initialLiveState(0, true);
    for (let now = 1000; now <= 60_000; now += 1000) {
      const plan = planLiveTick(state, view(now), seeded(now));
      for (const a of plan.actions) {
        expect(a.place.every(o => o.owner === `hex-${a.bot}` && o.qty >= 1 && o.qty <= 50 && Number.isInteger(o.price))).toBe(true);
      }
      state = plan.state;
    }
  });
});
