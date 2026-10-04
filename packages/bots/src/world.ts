import type { Rng } from './types';

export interface WorldState { fundamental: number; now: number }

/** Hidden fundamental: a 1-tick random walk per second with occasional 5-tick jumps (2% per step). */
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

/** A delayed, noisy (+/-5 ticks) estimate of the hidden fundamental, shown to everyone on the Big Screen. */
export function worldNews(state: WorldState, rng: Rng, delayMs = 5_000): DelayedNews {
  const noisy = Math.max(1, state.fundamental + Math.floor(rng() * 11) - 5);
  return { releaseAt: state.now + delayMs, text: `Delayed estimate: HACK fair value about ${noisy}.` };
}

/** Reads the fair-value number from a news line. Older firm/softer headlines carry no number and return null. */
export function parseNewsHint(text: string): number | null {
  const match = /fair value about (\d+)/.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}
