import { describe, expect, it } from 'vitest';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import { detectSpoofing } from '../../cop/src/index';
import { noiseOrder } from './noiseTrader';
import { Sim, seeded } from './sim.testutil';

const SEED = 2;
// Mirrors the runner's default bot set (PIT_BOT_COUNT=3), minus the informed trader.
const OWNERS = ['mm', 'noise-1', 'noise-2', 'noise-3'];
const SECONDS = 60;

/** MM + noise session, no spoofer. Same loop as the spoofer end-to-end test with the spoofer turned off. */
function negativeControlStream() {
  const sim = new Sim(OWNERS);
  const rng = seeded(SEED);
  for (let now = 0; now <= SECONDS * 1000; now += 500) {
    if (now % 1000 === 0) sim.requoteMaker(now);
    for (const owner of OWNERS.slice(1)) {
      const n = noiseOrder({ marketId: 1, owner, ...sim.touch(), elapsedMs: 500, lambdaPerSecond: 1 }, rng);
      if (n) sim.place(n, now);
    }
  }
  return sim.events;
}

describe('Cop negative control fixture (MM + noise, no spoofer)', () => {
  const events = negativeControlStream();

  it('the Market Maker actually trades, so the Cop sees fills and cancel-requotes', () => {
    expect(events.some(e => e.kind === 'trade' && (e.maker === 'mm' || e.taker === 'mm'))).toBe(true);
    expect(events.some(e => e.kind === 'order_cancelled' && e.owner === 'mm')).toBe(true);
  });

  it('the Cop raises no alerts at any point in the session', () => {
    for (let now = 0; now <= SECONDS * 1000; now += 500) expect(detectSpoofing(events, now)).toEqual([]);
  });

  it('matches the committed fixture (regenerate with: pnpm exec vitest run -u packages/bots)', async () => {
    const fixture = { seed: SEED, seconds: SECONDS, owners: OWNERS, expectedAlerts: 0, events };
    await expect(JSON.stringify(fixture, null, 1) + '\n').toMatchFileSnapshot('../fixtures/mm-negative-control.json');
  });
});
