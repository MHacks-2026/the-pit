#!/usr/bin/env node
// Fetches public 1-minute candles from Coinbase Exchange and turns them into integer HACK price paths
// for the simulator's hidden fundamental. No API key, no dependencies (Node 18+ fetch).
//
//   node scripts/fetch-price-paths.mjs                      # defaults below
//   SYMBOLS=BTC-USD,ETH-USD DAYS=3 node scripts/fetch-price-paths.mjs
//
// Raw responses are cached in .tools/market-data/ (gitignored). Only the rescaled tick paths are written to
// packages/bots/data/pricePaths.json: no raw prices or volumes are committed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYMBOLS = (process.env.SYMBOLS || 'BTC-USD,ETH-USD,SOL-USD,LTC-USD').split(',');
const DAYS = Number(process.env.DAYS || 10);
const END = new Date(process.env.END || Date.now());
END.setUTCSeconds(0, 0);
const STEPS_PER_PATH = Number(process.env.STEPS || 300);
// Match HACK's synthetic world: +/-1 tick per second with 2% five-tick jumps, about 1.22 ticks per step at 100.
const TARGET_STEP_STD = Math.sqrt(0.98 * 1 + 0.02 * 25) / 100;
const START_PRICE = 100;
// Single-minute outliers (bad ticks, flash spikes) are capped at 6x normal step volatility.
const MAX_STEP = 6 * TARGET_STEP_STD;
const CACHE = resolve(root, '.tools/market-data');
const OUT = resolve(root, 'packages/bots/data/pricePaths.json');
const PAGE_MINUTES = 300; // Coinbase returns at most 300 candles per request

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(symbol, start, end) {
  const file = resolve(CACHE, `${symbol}-${start.toISOString().replaceAll(':', '')}.json`);
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* not cached */ }
  const url = `https://api.exchange.coinbase.com/products/${symbol}/candles?granularity=60` +
    `&start=${start.toISOString()}&end=${end.toISOString()}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { 'user-agent': 'the-pit-price-paths' } });
    if (response.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (!response.ok) throw new Error(`${symbol} ${response.status} ${await response.text()}`);
    const rows = await response.json();
    await writeFile(file, JSON.stringify(rows));
    await sleep(250);
    return rows;
  }
  throw new Error(`${symbol}: rate limited`);
}

/** Close prices by minute (ascending). Missing minutes become null so we never bridge a gap with one big jump. */
async function closes(symbol) {
  const startAll = new Date(END.getTime() - DAYS * 86_400_000);
  const byMinute = new Map();
  for (let t = startAll.getTime(); t < END.getTime(); t += PAGE_MINUTES * 60_000) {
    const start = new Date(t);
    const end = new Date(Math.min(t + PAGE_MINUTES * 60_000, END.getTime()));
    for (const [time, , , , close] of await fetchPage(symbol, start, end)) byMinute.set(time * 1000, close);
  }
  const series = [];
  for (let t = startAll.getTime(); t < END.getTime(); t += 60_000) series.push(byMinute.get(t) ?? null);
  return series;
}

function logReturns(series) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    out.push(series[i] !== null && series[i - 1] !== null ? Math.log(series[i] / series[i - 1]) : null);
  }
  return out;
}

const std = xs => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

await mkdir(CACHE, { recursive: true });
const paths = [];
const symbols = [];
for (const symbol of SYMBOLS) {
  const returns = logReturns(await closes(symbol));
  const known = returns.filter(r => r !== null);
  // One scale per symbol keeps calm and volatile stretches distinct instead of flattening every path to the same volatility.
  const scale = TARGET_STEP_STD / std(known);
  let made = 0;
  for (let i = 0; i + STEPS_PER_PATH <= returns.length; i += STEPS_PER_PATH) {
    const chunk = returns.slice(i, i + STEPS_PER_PATH);
    if (chunk.filter(r => r === null).length > STEPS_PER_PATH * 0.02) continue; // skip windows with outages
    let logPrice = Math.log(START_PRICE);
    const path = [START_PRICE];
    for (const r of chunk.slice(1)) {
      logPrice += Math.max(-MAX_STEP, Math.min(MAX_STEP, (r ?? 0) * scale));
      path.push(Math.max(1, Math.round(Math.exp(logPrice))));
    }
    paths.push(path);
    made++;
  }
  symbols.push({ symbol, paths: made, scale: Number(scale.toFixed(2)), minuteStd: Number(std(known).toExponential(3)) });
  console.log(`${symbol}: ${known.length} minutes, ${made} paths, scale x${scale.toFixed(1)}`);
}

const output = {
  source: 'Coinbase Exchange public candles API (granularity 60 s), close prices',
  range: { start: new Date(END.getTime() - DAYS * 86_400_000).toISOString(), end: END.toISOString() },
  method: 'Per-symbol log returns rescaled to HACK volatility (~1.22% per step), compounded from 100, rounded to integer ticks. ' +
    '1 real minute = 1 simulated second. Single steps capped at 6x that volatility. Windows with >2% missing minutes are skipped; single missing minutes are flat.',
  stepsPerPath: STEPS_PER_PATH,
  symbols,
  paths,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({ ...output, paths: undefined })
  .slice(0, -1)},"paths":[\n${paths.map(p => JSON.stringify(p)).join(',\n')}\n]}\n`);
console.log(`Wrote ${paths.length} paths x ${STEPS_PER_PATH} steps to ${OUT}`);
