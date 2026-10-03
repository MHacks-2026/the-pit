import { describe, expect, it } from 'vitest';
// Relative import, same pattern as copStreams.test.ts (bots stays free of a new package dependency).
import { detectSpoofing, parseEventLog, type CopEvent } from '../../cop/src/index';
import { runStream, SPOOFER_OWNER } from './streamSim';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const SECONDS = 60;
const POLL_MS = 1_000; // the Cop's window is 30 s, so 1 s polling loses nothing

const CONDITIONS = [
  { name: 'MM + noise + informed', spoofer: false, mmRequoteMs: 1_000 },
  { name: 'Fast-requote MM (250 ms)', spoofer: false, mmRequoteMs: 250 },
  { name: 'With spoofer', spoofer: true, mmRequoteMs: 1_000 },
  { name: 'With spoofer + fast MM', spoofer: true, mmRequoteMs: 250 },
];

/** Owners named by the Cop's alerts in one simulated session (one entry per distinct incident). */
function alertOwners(seed: number, spoofer: boolean, mmRequoteMs: number): string[] {
  const rows = runStream({ seed, seconds: SECONDS, spoofer, mmRequoteMs });
  const events = rows.map(parseEventLog).filter((e): e is CopEvent => e !== null);
  const byIncident = new Map<string, string>();
  for (let now = 0; now <= SECONDS * 1000 + 30_000; now += POLL_MS) {
    for (const alert of detectSpoofing(events, now)) byIncident.set(alert.evidence.incidentKey, alert.owner);
  }
  return [...byIncident.values()];
}

describe('Cop evaluation on simulated sessions', () => {
  it('prints the precision and recall table and holds the thresholds', () => {
    const lines = [
      '| Condition | Runs | Spoofer caught | Alerts on spoofer | Alerts on other accounts | Runs with a false alarm |',
      '|---|---|---|---|---|---|',
    ];
    let truePositives = 0;
    let falsePositives = 0;
    let spooferRuns = 0;
    let spooferRunsCaught = 0;

    for (const condition of CONDITIONS) {
      let caught = 0;
      let spooferAlerts = 0;
      let otherAlerts = 0;
      let runsWithFalseAlarm = 0;
      for (const seed of SEEDS) {
        const owners = alertOwners(seed, condition.spoofer, condition.mmRequoteMs);
        const onSpoofer = owners.filter(owner => owner === SPOOFER_OWNER).length;
        const onOthers = owners.length - onSpoofer;
        spooferAlerts += onSpoofer;
        otherAlerts += onOthers;
        if (onSpoofer > 0) caught++;
        if (onOthers > 0) runsWithFalseAlarm++;
      }
      truePositives += spooferAlerts;
      falsePositives += otherAlerts;
      if (condition.spoofer) {
        spooferRuns += SEEDS.length;
        spooferRunsCaught += caught;
      }
      const caughtCell = condition.spoofer ? `${caught}/${SEEDS.length}` : 'n/a';
      lines.push(`| ${condition.name} | ${SEEDS.length} | ${caughtCell} | ${spooferAlerts} | ${otherAlerts} | ${runsWithFalseAlarm} |`);
    }

    const recall = spooferRuns ? spooferRunsCaught / spooferRuns : 0;
    const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : 0;
    lines.push('');
    lines.push(`Recall (spoofer sessions where the spoofer was flagged): ${(recall * 100).toFixed(1)}% (${spooferRunsCaught}/${spooferRuns})`);
    lines.push(`Precision (alerts that named the spoofer): ${(precision * 100).toFixed(1)}% (${truePositives}/${truePositives + falsePositives})`);
    lines.push(`${SEEDS.length} seeds x ${SECONDS} s per condition. Simulated manipulator, play money.`);
    console.log('\n' + lines.join('\n') + '\n');

    expect(falsePositives).toBe(0);
    expect(recall).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});