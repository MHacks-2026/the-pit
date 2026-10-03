# HANDOFF.md

Newest entry on top. Add one at the end of every agent session or when you switch tools.
Keep each entry under 200 words.

Template:

## [<TICKET>] <time>, <tool> -> next
Branch: <name> (pushed, last commit <hash>)
Done: <bullets>
Not done / next: <bullets>
Gotchas: <anything surprising>
How to verify: <commands>
Files touched: <list>

---

## [T29 prep, D8] Cop negative-control fixture, Claude Code -> next
Branch: main (base 320606b)
Done: packages/bots/fixtures/mm-negative-control.json: 60 s, seed 2, MM + noise-1..3 (runner default), no spoofer. 465 CopEvents (orders, cancels, trades, self_trade_attempt); detectSpoofing returns [] at every 500 ms step. negativeControl.test.ts guards this and checks the fixture stays deterministic. Sim moved to sim.testutil.ts (shared with spoofer.test.ts) and now keeps self_trade_attempt events. D8 records the FinTech track.
Not done / next: T29 harness (N sessions, precision/recall). MM gets only ~1 fill/min: cancel-all + requote every second puts it behind older noise orders at the same prices. Consider keeping unchanged quotes (runner and sim). The runner's noise GTCs are never cancelled and will hit the 20-open-order limit.
Gotchas: Fixture is a vitest file snapshot; regenerate with `pnpm exec vitest run -u packages/bots`. No @types/node, so tests in bots cannot import node:fs.
How to verify: pnpm test && pnpm build
Files touched: packages/bots/src/{sim.testutil,negativeControl.test,spoofer.test}.ts, packages/bots/fixtures/, docs/DECISIONS.md, HANDOFF.md

---

## [T06] 16:45 EDT, Claude chat -> next
Branch: fe/web-skeleton (merged to main via PR #1, last commit d624c80)
Done: /join (name form, 1 to 32 chars, 10,000 start cash, Start trading link) and /trade (phone UI: price and qty steppers, Buy/Sell, cash/position/last/bid-ask, open orders with cancel). apps/web/lib/pit-client.ts has a PitClient interface and mockPitClient that enforces the spec risk limits. /screen already existed. Vercel preview checked on all 3 routes.
Not done / next: T10/T13: replace mockPitClient with a SpacetimeDB-backed client behind the same interface; /trade does not know who joined yet. T20 Big Screen layout. T23 Try-to-cheat should call layeringMacro from packages/bots.
Gotchas: Mock state is in memory (resets on refresh) and resting orders never fill. Vercel cancels builds for commits that change no files. pnpm build needs corepack; without it use pnpm --filter web build.
How to verify: pnpm test && pnpm --filter web build; pnpm --filter web dev, then open /join, /trade, /screen
Files touched: apps/web/app/join/*, apps/web/app/trade/*, apps/web/lib/pit-client.ts, apps/web/app/globals.css, TODO.md, HANDOFF.md

---

## [T11, T17, T19] bots package, Claude (Cowork) -> next
Branch: main (uncommitted local changes, not pushed)
Done: Repaired packages/bots/src/index.ts (file was pasted twice, did not compile). Split bots into world.ts, marketMaker.ts, noiseTrader.ts, informedTrader.ts, spoofer.ts; index.ts re-exports, so runner imports are unchanged. Removed the unused Strategy/Observation API. New: spooferStep state machine (layer -> opposite IOC -> cancel -> cooldown), layeringMacro for the Try-to-cheat button. Tests: A-S skew/spread widening, world/informed, and an end-to-end sim (real engine + Cop) where every spoofer cycle is flagged and MM + noise are never flagged over 5 seeds. 31 tests green.
Not done / next: Runner must pass sigma: sigmaTicks(recentMids) to marketMakerQuotes and add a spoofer bot behind an env flag (BE). Web Try-to-cheat (T23) should call layeringMacro.
Gotchas: spoofer.test.ts imports the Cop via ../../cop/src/index to avoid a package.json change; swap to @the-pit/cop devDependency if desired. Spoofer layers sit 1+ tick behind the touch so its own IOC never self-trades.
How to verify: pnpm test && pnpm build
Files touched: packages/bots/src/*, TODO.md, HANDOFF.md

---

## [Cloud setup] 21:49 CEST, Codex -> next
Branch: main (pushed, last code commit f3e76ad)
Done: Linked the SpacetimeDB CLI to Shafir's web account and published `the-pit-mhacks-2026` on Maincloud. Verified the HACK market. Logged Vercel CLI into `shafirkhajo-3165`, found `mh-acks-2026/the-pit`, set the public URI and database variables for Production and Preview, and redeployed production. `/screen` now says “No alerts yet” without browser errors. A short local runner smoke test registered three bots and wrote orders; the runner was stopped afterward.
Not done / next: Host the runner on an always-on service with its admin token kept outside Git. Run a live Cop acceptance test after that.
Gotchas: Google rejects sign-in from automated browsers; device-code CLI login worked in the normal browser. The Vercel project belongs to `mh-acks-2026`, while the connected Vercel app listed a different account.
How to verify: Open `https://the-pit-seven.vercel.app/screen`; inspect `the-pit-mhacks-2026` in SpacetimeDB Maincloud. `vercel env ls production --project the-pit --scope mh-acks-2026` lists both public variables.
Files touched: HANDOFF.md only; cloud database and Vercel project configuration changed externally.

---

## [Vercel alert feed] 20:51 CEST, Codex -> next
Branch: main (pushed, last commit 3a4f501)
Done: Removed the browser's localhost SpacetimeDB fallback. The screen now explains missing Vercel configuration or a connection error. Production build and 17 local tests passed; local production render showed the configuration message.
Not done / next: Configure a public `wss://` SpacetimeDB endpoint and published database name as `NEXT_PUBLIC_SPACETIME_URI` and `NEXT_PUBLIC_SPACETIME_DB` in the Vercel project, then redeploy. Keep the long-running runner on separate hosting.
Gotchas: The connected Vercel account listed no projects, so project settings could not be inspected or changed here. The reported deployment is `https://the-pit-seven.vercel.app/screen`.
How to verify: Open `/screen`; it should show alerts or “No alerts yet,” with no permanent connecting state. Check the browser WebSocket connection to the configured endpoint.
Files touched: apps/web/app/screen/AlertFeed.tsx, docs/RUNNER.md.

---

## [T05, T09, T12, T21] 19:58 CEST, Codex -> next
Branch: main (pushed, last commit b5dc215)
Done: Private repo populated; SpacetimeDB module, generated bindings, atomic matching reducers, bot runner, pure Cop detector, admin alert reducer, and live `/screen` alert feed. T05/T09/T12/T21 checked in TODO.md. A concurrent bot strategy commit was merged; package exports restored and new market maker state made immutable.
Not done / next: Vercel preview is not linked. Remaining tickets in TODO.md belong to the broader project.
Gotchas: Use a disposable database for integration tests. Persistent orders can invalidate order assumptions and eventually hit open-order limits. Keep ADMIN_TOKEN and runner token file outside Git.
How to verify: `pnpm test && pnpm build`; for live tests start local SpacetimeDB, publish a fresh database, set `PIT_TEST_DATABASE` and `ADMIN_TOKEN`, run the two integration tests, then start the runner and run `apps/runner/test/cop-path.test.ts` with `PIT_COP_RUNNER_ACTIVE=true`.
Files touched: spacetimedb module, packages/engine, packages/bots, packages/cop, packages/bindings, apps/runner, apps/web, docs/CLI.md, docs/RUNNER.md, TODO.md.

---
