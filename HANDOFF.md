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

## [Runner host] 00:45 CEST, Codex -> next
Branch: main (runner supervision commit eef884f pushed; logon task installed and verified)
Done: Supervised the cloud runner with 5-second restarts, a local mutex, redacted UTF-8 logs at `.tools/cloud-runner.log`, and safe connection errors. Installed `ThePitCloudRunner` under Shafir's Windows user at logon. Stopped the manual process and started the task; it is Running and connected five bot identities. The task contains no token. 42 tests and build pass.
Not done / next: Keep the PC awake and sign in after reboot. Confirm the task runs after a real reboot/logon. Coordinate before any other machine starts a runner.
Gotchas: The restricted command sandbox cannot reach Maincloud; the installed task can. A logon task does not run before user sign-in. The local mutex cannot stop a runner on another machine.
How to verify: `Get-ScheduledTask -TaskName ThePitCloudRunner`; `Get-ScheduledTaskInfo -TaskName ThePitCloudRunner`; `Get-Content .tools/cloud-runner.log -Tail 20`; `pnpm test`; `pnpm build`.
Files touched: apps/runner/src/index.ts, scripts/run-cloud-runner.ps1, scripts/install-runner-task.ps1, docs/RUNNER.md, HANDOFF.md.

---

## [Runner restart] 00:17 CEST, Codex -> next
Branch: main (pushed, last code commit cb00970)
Done: Restarted one runner on Shafir's Windows machine against cloud database `the-pit-mhacks-2026` (`wss://maincloud.spacetimedb.com`). Five bot identities connected and cloud trade count rose from 48 to over 300. Fixed open-order rejects so a single bot cannot stop a tick; noise bots clear stale orders near the cap. Added `scripts/run-cloud-runner.ps1`, which obtains the CLI login token without printing it and rejects a second local instance. Merged T29 evaluation; 42 tests and build pass.
Not done / next: Move the runner to one always-on worker host; current shell session depends on this machine staying awake. Nick should fix the cheat IOC to use a live marketable buy and confirm it filled before reporting success.
Gotchas: Live smoke test joined `backend-smoke`; its four sell layers cancelled, but buy IOC order 5451 at 122 did not fill after the ask moved, so no Cop alert was correct. Local mutex does not prevent a runner on another machine; coordinate one owner.
How to verify: `powershell -File scripts/run-cloud-runner.ps1`; second invocation must fail. `pnpm test` and `pnpm build` pass with SpacetimeDB CLI on PATH. Check `/screen` or Maincloud trade/event counts.
Files touched: apps/runner/src/index.ts, docs/RUNNER.md, scripts/run-cloud-runner.ps1, HANDOFF.md.

---

## [T29 prep] runStream for the evaluation harness, Claude Code -> next
Branch: main
Done: packages/bots/src/streamSim.ts exports runStream({ seed, seconds = 60, spoofer = false, mmRequoteMs = 1000 }) -> EventLogRow[], plus SPOOFER_OWNER, STREAM_OWNERS, seeded, StreamExchange. Re-exported from @the-pit/bots. copStreams.test.ts now calls it; packages/cop/fixtures/streams.ts is byte-identical for seed 1.
Not done / next: T29 harness on top of runStream (N seeds, with/without spoofer, precision/recall).
Gotchas: EventLogRow is declared in bots with the same shape as the Cop's EventLogInput (no cross-package import), so rows pass straight to parseEventLog. The spoofer uses seeded(seed + 1000). Noise bot count is fixed at 3.
How to verify: pnpm test && pnpm build
Files touched: packages/bots/src/{streamSim,streamSim.test,sim.testutil,copStreams.test,index}.ts, HANDOFF.md

---

## [T24 QR half, T25] 18:05 EDT, Claude chat -> next
Branch: fe/qr-join
Done: /screen has a "Scan to trade" card with a QR code for https://the-pit-seven.vercel.app/join (static apps/web/public/join-qr.svg, no new dependency; checked that it decodes to that URL). T25 ticked: the leaderboard (cash + position at mid, PnL vs 10,000, robot badge) was built in T10/T20.
Not done / next: T24 starting-cash display and admin reset-market button (not mine); T35 Beat the Cop. If the production URL changes, the QR must be regenerated.
Gotchas: QR encodes the production URL, not the preview. Bots and Cop alerts only show when the runner and Cop are running against the live database.
How to verify: pnpm --filter web build, open /screen, scan the code with a phone
Files touched: apps/web/public/join-qr.svg (new), apps/web/app/screen/page.tsx, apps/web/app/globals.css (appended), TODO.md, HANDOFF.md

---

## [T23, T14] 17:50 EDT, Claude chat -> next
Branch: fe/t14-depth (T23 already merged to main as fe/t23-cheat)
Done: T23: /trade has a red "Try to cheat" button (app/trade/CheatButton.tsx). It cancel_all first, then places 4 sell GTC layers (20 each) behind the best ask, waits 1 s, buys 2 IOC at the best ask, waits 1 s, cancel_all (always runs, even on error). Same shape as layeringMacro. Checked on the preview: wall appears, ask moves, wall disappears. T14: /screen has a "Market depth" card (app/screen/DepthChart.tsx): cumulative buy/sell steps from the full book.
Not done / next: confirm the Cop raises an alert from the button (needs the Cop runner against the live DB; not seen yet). T25 polish, T35 Beat the Cop, T30/T36 3D X-ray.
Gotchas: The button trades as the human's own account, so it needs a joined account. Old open orders are cancelled first to avoid a self-trade.
How to verify: pnpm --filter web build, then press the button on a preview and watch /screen
Files touched: apps/web/app/trade/{CheatButton,TradePanel}.tsx, apps/web/app/screen/{DepthChart,MarketBoard}.tsx, apps/web/app/globals.css (appended), TODO.md, HANDOFF.md

---

## [T13] 17:30 EDT, Claude chat -> next
Branch: fe/t13-live-trade (merged to main via PR)
Done: /join and /trade now use the live SpacetimeDB reducers. apps/web/lib/live.tsx (LiveProvider) holds one connection and saves the identity token in localStorage, so /join, /trade and refreshes are the same trader. JoinForm calls join and skips the form if the account already exists. TradePanel reads account, position, order and trade tables; Buy/Sell call place_order (GTC, market 1), Cancel calls cancel_order; reducer errors show in the red line. Checked on the Vercel preview: buy filled, cash updated.
Not done / next: T23 (Try-to-cheat button), T14 (depth chart), T25 polish, T35. mockPitClient in lib/pit-client.ts is now unused (kept as reference).
Gotchas: Needs NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB, so localhost shows "not configured"; test on a Vercel preview. Each browser is one trader: use an incognito window for a second one. join ignores the name if the identity already has an account.
How to verify: pnpm --filter web build, then join and buy on the preview
Files touched: apps/web/lib/live.tsx (new), apps/web/app/join/JoinForm.tsx, apps/web/app/trade/TradePanel.tsx, TODO.md, HANDOFF.md

---

## [T10, T20] 17:05 EDT, Claude chat -> next
Branch: fe/big-screen (merged to main via PR)
Done: /screen now has a "Live market" board (apps/web/app/screen/MarketBoard.tsx): HACK price with line chart, order book (top 8 levels, bid/ask bars), trade tape (last 12), leaderboard (cash + position at mid, robot badge for bots, PnL vs 10,000). Reads order, trade, account, position tables live from SpacetimeDB. Checked on the Vercel preview with bots trading.
Not done / next: T13 (wire /join and /trade to SpacetimeDB reducers, replacing mockPitClient), T14 (depth chart, better price chart), T23, T35. Chart is flat when price does not move.
Gotchas: Needs NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB, so localhost shows "not configured"; test on the Vercel preview. MarketBoard has its own SpacetimeDBProvider, like AlertFeed.
How to verify: pnpm --filter web build, then open /screen on the preview
Files touched: apps/web/app/screen/{MarketBoard.tsx,page.tsx}, apps/web/app/globals.css (appended), TODO.md, HANDOFF.md

---

## [T29 prep, D8] Cop fixture streams, Claude Code -> next
Branch: main (base 320606b)
Done: packages/cop/fixtures/streams.ts: three 60 s, seed 1 runs of the real bots through matchOrder, as event_log rows (payload = JSON.stringify(EngineEvent)). 1 mmNoiseInformed: 425 rows, 12 MM fills, 0 alerts. 2 fastRequoteMm (MM requotes every 250 ms): 1145 rows, 494 cancels, 0 alerts. 3 withSpoofer: 4 alerts, all SPOOFER_OWNER. copStreams.test.ts generates and guards it. D8 records the FinTech track.
Not done / next: T29 harness (N sessions, precision/recall). Without the informed trader the MM gets ~1 fill/min (requoting puts it behind older noise orders). Noise GTCs are never cancelled and will hit the 20-open-order limit in long runs.
Gotchas: The fixture is a vitest file snapshot; regenerate with `pnpm exec vitest run -u packages/bots`. Owners are readable names, not hex identities. The spoofer has its own rng, so the other bots make the same random draws as in run 1.
How to verify: pnpm test && pnpm build
Files touched: packages/bots/src/{sim.testutil,copStreams.test,spoofer.test}.ts, packages/cop/fixtures/streams.ts, docs/DECISIONS.md, HANDOFF.md

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
