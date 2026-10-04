import { describe, expect, it } from 'vitest';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import { detectSpoofing, parseEventLog, type CopEvent } from '../../cop/src/index';
import data from '../data/pricePaths.json';
import { ADAPTIVE_ARMS, type AdaptiveArm, type AdaptiveParams, type ArmPrior } from './adaptiveTrader';
import { ADAPTIVE_OWNER, runSession, STREAM_OWNERS, type SessionOptions } from './streamSim';

// Offline training for the adaptive AI trader. Slow (about a minute), so it runs only on request:
//   PIT_TRAIN=1 pnpm exec vitest run -u packages/bots/src/adaptiveTraining.test.ts
// It writes packages/bots/src/adaptivePriors.ts (starting estimates per arm) and docs/ADAPTIVE_EVAL.md (held-out results).

const paths = (data as { paths: number[][] }).paths;
const SECONDS = (data as { stepsPerPath: number }).stepsPerPath - 1;
const isTest = (index: number) => index % 10 >= 7; // 70% train / 30% held out, interleaved across symbols and days
const trainPaths = paths.filter((_, i) => !isTest(i));
const testPaths = paths.filter((_, i) => isTest(i));
const SYNTHETIC_SEEDS = Array.from({ length: 50 }, (_, i) => 10_000 + i);

type Session = Pick<SessionOptions, 'seed' | 'fundamentalPath'>;
const trainSessions: Session[] = [
  ...trainPaths.map((fundamentalPath, i) => ({ seed: i + 1, fundamentalPath })),
  ...SYNTHETIC_SEEDS.map(seed => ({ seed })),
];
// Hyperparameters are chosen on a validation slice of the training paths, never on the held-out test paths.
const isValidation = (index: number) => index < trainPaths.length && index % 5 === 4;
const GRID = (['total', 'trading'] as const).flatMap(reward =>
  [2, 10, 30, 100].flatMap(priorWeight => [0.9, 0.97].map(discount => ({ reward, priorWeight, discount }))));
const testSessions: Session[] = testPaths.map((fundamentalPath, i) => ({ seed: 5_000 + i, fundamentalPath }));
// News strategy settings: how big a gap between the public hint and the mid, and how fresh the hint must be.
const NEWS_GRID = [4, 6, 8, 11].flatMap(newsThreshold => [1_000, 5_000, 15_000].map(newsMaxAgeMs => ({ newsThreshold, newsMaxAgeMs })));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Long synchronous loops starve Vitest's worker RPC ("Timeout calling onTaskUpdate"); yield between batches.
const breathe = () => new Promise<void>(resolve => setImmediate(resolve));
const variance = (xs: number[]) => mean(xs.map(x => (x - mean(xs)) ** 2));

function adaptiveAlerts(rows: ReturnType<typeof runSession>['rows']): number {
  const events = rows.map(parseEventLog).filter((e): e is CopEvent => e !== null);
  const incidents = new Set<string>();
  for (let now = 0; now <= SECONDS * 1000 + 30_000; now += 1000) {
    for (const alert of detectSpoofing(events, now)) if (alert.owner === ADAPTIVE_OWNER) incidents.add(alert.evidence.incidentKey);
  }
  return incidents.size;
}

describe.runIf(process.env.PIT_TRAIN)('adaptive trader training (PIT_TRAIN=1)', () => {
  it('learns per-arm priors on the training split and reports held-out results', async () => {
    const validation = trainSessions.filter((_, i) => isValidation(i));

    // 0. Pick the news strategy's settings on the validation slice (news played alone).
    const newsRows: { g: typeof NEWS_GRID[number]; score: number }[] = [];
    let news = NEWS_GRID[0];
    let bestNews = -Infinity;
    for (const g of NEWS_GRID) {
      await breathe();
      const score = mean(validation.map(s =>
        runSession({ ...s, seconds: SECONDS, adaptive: true, adaptiveParams: { ...g, fixedArm: 'news' } }).pnl[ADAPTIVE_OWNER]));
      newsRows.push({ g, score });
      if (score > bestNews) { bestNews = score; news = g; }
    }

    // 1. Play each arm alone on every training session; its epoch rewards are that arm's evidence.
    const rewardsBySession: ReturnType<typeof runSession>['adaptiveEpochs'][][] = [];
    for (const arm of ADAPTIVE_ARMS) {
      await breathe();
      rewardsBySession.push(trainSessions.map(s =>
        runSession({ ...s, seconds: SECONDS, adaptive: true, adaptiveParams: { ...news, fixedArm: arm } }).adaptiveEpochs));
    }
    // Priors are fitted under the same scoring rule the bot will use.
    const priorsFrom = (rule: 'total' | 'trading', use: (index: number) => boolean) => Object.fromEntries(ADAPTIVE_ARMS.map((arm, a) => {
      const rewards = rewardsBySession[a].filter((_, i) => use(i)).flat().map(e => e[rule]);
      return [arm, { mean: Math.round(mean(rewards) * 10) / 10, variance: Math.round(variance(rewards)) }];
    })) as Record<AdaptiveArm, ArmPrior>;

    // 2. Pick priorWeight and discount on the validation slice, using priors fitted without it.
    const fitPriors = { total: priorsFrom('total', i => !isValidation(i)), trading: priorsFrom('trading', i => !isValidation(i)) };
    const gridRows: string[] = [];
    let chosen = GRID[0];
    let bestScore = -Infinity;
    for (const g of GRID) {
      await breathe();
      const score = mean(validation.map(s =>
        runSession({ ...s, seconds: SECONDS, adaptive: true, adaptiveParams: { ...news, ...g }, adaptivePriors: fitPriors[g.reward] }).pnl[ADAPTIVE_OWNER]));
      gridRows.push(`| ${g.reward} | ${g.priorWeight} | ${g.discount} | ${Math.round(score)} |`);
      if (score > bestScore) { bestScore = score; chosen = g; }
    }

    // 3. Final priors on the whole training split.
    const priors = priorsFrom(chosen.reward, () => true);
    const tuned = { ...news, ...chosen };
    const epochCounts = Object.fromEntries(ADAPTIVE_ARMS.map((arm, a) => [arm, rewardsBySession[a].flat().length]));

    // 2. Held-out evaluation on real paths the priors never saw.
    const configs: { name: string; params?: Partial<AdaptiveParams>; priors?: typeof priors }[] = [
      { name: 'Adaptive AI (trained priors, tuned)', params: tuned, priors },
      { name: 'Adaptive AI (trained, news strategy switched off)', params: { ...tuned, arms: ADAPTIVE_ARMS.filter(a => a !== 'news') }, priors },
      { name: 'Adaptive AI (no priors)', params: news },
      ...ADAPTIVE_ARMS.map(arm => ({ name: `Fixed: ${arm}`, params: { ...news, fixedArm: arm } })),
    ];
    const rows: string[] = [];
    let aiAlerts = 0;
    let otherBots: Record<string, number[]> = {};
    for (const config of configs) {
      await breathe();
      const pnls: number[] = [];
      const armUse: Record<string, number> = {};
      for (const session of testSessions) {
        const result = runSession({ ...session, seconds: SECONDS, adaptive: true, adaptiveParams: config.params, adaptivePriors: config.priors });
        pnls.push(result.pnl[ADAPTIVE_OWNER]);
        for (const e of result.adaptiveEpochs) armUse[e.arm] = (armUse[e.arm] ?? 0) + 1;
        aiAlerts += adaptiveAlerts(result.rows);
        if (config === configs[0]) {
          for (const owner of STREAM_OWNERS) (otherBots[owner] ??= []).push(result.pnl[owner]);
        }
      }
      const total = Object.values(armUse).reduce((a, b) => a + b, 0);
      const mix = ADAPTIVE_ARMS.filter(a => armUse[a]).map(a => `${a} ${Math.round(100 * armUse[a] / total)}%`).join(', ');
      const sorted = [...pnls].sort((a, b) => a - b);
      rows.push(`| ${config.name} | ${Math.round(mean(pnls))} | ${Math.round(sorted[Math.floor(sorted.length / 2)])} | ${sorted[0]} | ${sorted[sorted.length - 1]} | ${mix} |`);
    }
    const others = Object.entries(otherBots).map(([owner, xs]) => `| ${owner} | ${Math.round(mean(xs))} |`);

    // 3. Safety: the AI must never trip the Cop.
    expect(aiAlerts).toBe(0);

    const meta = data as { range: { start: string; end: string }; symbols: { symbol: string }[] };
    const priorsFile = [
      '// Generated by packages/bots/src/adaptiveTraining.test.ts. Do not edit by hand; retrain with:',
      '//   PIT_TRAIN=1 pnpm exec vitest run -u packages/bots/src/adaptiveTraining.test.ts',
      "import type { AdaptiveArm, AdaptiveParams, ArmPrior } from './adaptiveTrader';",
      '',
      '/** Mean and variance of each arm\'s 10 s epoch reward (play dollars), measured by playing that arm alone. */',
      `export const ADAPTIVE_PRIORS: Record<AdaptiveArm, ArmPrior> = ${JSON.stringify(priors, null, 2)};`,
      '',
      '/** Scoring rule, priorWeight, discount and news settings chosen on a validation slice of the training paths. */',
      `export const ADAPTIVE_TUNED_PARAMS: Pick<AdaptiveParams, 'reward' | 'priorWeight' | 'discount' | 'newsThreshold' | 'newsMaxAgeMs'> = ${JSON.stringify(tuned)};`,
      '',
      `export const ADAPTIVE_TRAINING = ${JSON.stringify({
        realPaths: trainPaths.length, syntheticSessions: SYNTHETIC_SEEDS.length, secondsPerSession: SECONDS, epochsPerArm: epochCounts,
        data: `${meta.symbols.map(s => s.symbol).join(', ')} 1-minute candles, ${meta.range.start} to ${meta.range.end}`,
      }, null, 2)};`,
      '',
    ].join('\n');
    const report = [
      '# Adaptive AI trader: held-out evaluation',
      '',
      `Generated by \`packages/bots/src/adaptiveTraining.test.ts\`. Priors were learned on ${trainPaths.length} real price paths plus ${SYNTHETIC_SEEDS.length} synthetic sessions; ` +
        `these results are on ${testPaths.length} **held-out** real paths (${SECONDS} s each). Data: ${meta.symbols.map(s => s.symbol).join(', ')} ` +
        `1-minute candles from Coinbase, ${meta.range.start.slice(0, 10)} to ${meta.range.end.slice(0, 10)}, rescaled to HACK ticks (see packages/bots/data/pricePaths.json).`,
      '',
      'The AI sees only public information: the book, recent mids, its own position, and the public news hint ' +
        '("Delayed estimate: HACK fair value about N", every 10 s, released 5 s late, +/-5 ticks of noise).',
      '',
      'Profit is mark-to-market in play dollars per session.',
      '',
      '| Strategy | Mean profit | Median | Worst | Best | Strategy mix |',
      '|---|---|---|---|---|---|',
      ...rows,
      '',
      `Cop alerts on the AI across all held-out sessions: **${aiAlerts}**.`,
      '',
      `Hyperparameters chosen on ${validation.length} validation paths from the training split (mean AI profit), never on the held-out paths:`,
      '',
      '| Scoring | priorWeight | discount | Validation mean profit |',
      '|---|---|---|---|',
      ...gridRows.map(r => (r.startsWith(`| ${chosen.reward} | ${chosen.priorWeight} | ${chosen.discount} |`) ? r.replace(/\| (-?\d+) \|$/, '| **$1** (chosen) |') : r)),
      '',
      'News strategy settings, chosen the same way (news played alone on the validation paths; gap = hint minus mid, in ticks):',
      '',
      '| Min gap | Max hint age | Validation mean profit |',
      '|---|---|---|',
      ...newsRows.map(({ g, score }) => `| ${g.newsThreshold} | ${g.newsMaxAgeMs / 1000} s | ${g === news ? `**${Math.round(score)}** (chosen)` : Math.round(score)} |`),
      '',
      'Finding: the public news hint (released 5 s late, +/-5 ticks of noise) carries little or no edge here, because the informed bot ' +
        'trades on the hidden value in real time and the price has usually moved before the hint is public. Stricter settings lose less ' +
        'mainly by trading less. Compare the two trained-AI rows above to see whether having the news strategy helped.',
      '',
      'Version history (held-out results seen before this version, listed so nothing is cherry-picked): ' +
        'v1 (10 days, 4 strategies, total-equity scoring, prior weight 2): -258 trained, -229 no priors. ' +
        "v2 (scored on the epoch's own trading): -341 trained, -954 no priors. " +
        'v3 (validation also chooses the scoring rule): -56 trained, -229 no priors, 0 flat, on 55 held-out paths. ' +
        'This version (v4) uses 30 days of data and adds the news strategy, so its held-out set is new and larger; ' +
        'the earlier numbers are not directly comparable. Held-out paths were not used for any choice.',
      '',
      'Other bots in the same sessions (trained-priors run):',
      '',
      '| Bot | Mean profit |',
      '|---|---|',
      ...others,
      '',
      'The informed bot sees the hidden fundamental; the AI does not. Simulated market, play money; real data only shapes the fundamental.',
      '',
    ].join('\n');
    await expect(priorsFile).toMatchFileSnapshot('./adaptivePriors.ts');
    await expect(report).toMatchFileSnapshot('../../../docs/ADAPTIVE_EVAL.md');
  }, 600_000);
});
