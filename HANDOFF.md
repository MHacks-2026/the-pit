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

## [T22 voice] ElevenLabs Cop voice, Claude Code -> next
Branch: FrontEndChanges
Done: /api/speak takes an alert (never free text), writes the narrator's sentence, and returns ElevenLabs audio (lib/speech.ts: cache, 1 call / 3 s, 8 s timeout, NARRATOR_ENABLED kill switch, tested) or JSON text. /screen Cop desk has "Turn on Cop voice" (the click browsers require); new alerts are read out with ElevenLabs, else the browser voice. Default voice: ElevenLabs premade "Daniel" (onwK4e9ZLuTAKqWW03F9), model eleven_flash_v2_5; override with ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID. .gitignore now ignores .env files.
Not done / next: Verified locally with the updated key: /api/speak returned ElevenLabs MP3 for a full alert sentence in 0.65 s, and on /screen a live spoof was read out (label "Speaking new alerts with: ElevenLabs"). Still to do: set ELEVENLABS_API_KEY in Vercel (server-only, no NEXT_PUBLIC_) and redeploy, then check the label on the live site. Regenerate the key after the hackathon: it was pasted in chat.
Gotchas: Voice is off on every page load on purpose (browser autoplay rules). The default voice id is a premade voice that could not be checked with the restricted key.
How to verify: pnpm test; POST /api/speak with an alert body; on /screen turn the voice on and trigger Try to cheat.
Files touched: apps/web/lib/{speech,speech.test,serverVoice}.ts, apps/web/app/api/{speak,narrate}/route.ts, apps/web/app/screen/AlertFeed.tsx, apps/web/app/globals.css, .env.example, .gitignore, HANDOFF.md

---

## [UI] Trading-pit redesign + /trade join fix, Claude Code -> next
Branch: main
Done: Same features and data, new look. Big Shoulders (Chicago) for wordmark/prices/numbers, Atkinson Hyperlegible Next for text, via next/font (no new dependency). Palette: floor #14171c, chalk #ecede8, up #4ade80, down #ff6b5e, Cop tape #ffd23f (Cop only). Removed the starfield backdrop, eyebrow labels, middle-dot strings and the robot emoji; traders now wear jacket badges (apps/web/lib/badges.ts, tested; bots outlined). Motion: price ticks on change; police tape sweeps the top of /screen when a NEW Cop alert lands; alerts render as citation tickets. Also fixed a real bug: the Ticker's anonymous connection was reused for the whole page (SpacetimeDB shares one connection per database), so /trade never recognised the player who joined; every provider now uses liveConnectionBuilder with the saved token.
Not done / next: Prasiddha, please review the frontend files. Revert with git revert if the team prefers the old look.
Gotchas: Checked with screenshots at 390 px, 1440 px and 1920 px against a local bot market, including a live spoof (sweep + citation).
How to verify: pnpm build; open /screen, /join, /trade
Files touched: apps/web/app/* (globals.css rewritten, Backdrop.tsx removed, TraderBadge.tsx added), apps/web/lib/{badges,badges.test,live}.ts(x), HANDOFF.md

---

## [D10] Tamper-evident market record, Claude Code -> next
Branch: main (module change NOT yet published to Maincloud)
Done: packages/cop/src/chain.ts: pure SHA-256 (NIST vectors + Node crypto cross-check), canonicalEvent, chainHash, verifyChain. Module: public event_chain + chain_head; every event_log insert appends a link in the same transaction; admin_reset_market writes a reset:<id> marker that links to the old head. audit-cli verifies the chain. /screen alert feed shows "Market record sealed: N linked events · head …". Bindings regenerated (also adds admin_bots_start/stop). Local: in-place upgrade from the previous module worked (old events counted as before-the-chain); hand-edited and hand-deleted events were reported as CHAIN_EVENT_ALTERED / CHAIN_EVENT_MISSING; reset + audit passes.
Not done / next: Publish to Maincloud (same publish as D9 and the reset). Optional: post the head hash somewhere public on a schedule.
Gotchas: Run the live integration test files one at a time against one database (they trade at the same prices and collide if Vitest runs them in parallel). Owner can still rewrite every hash consistently; see LIMITATIONS.
How to verify: pnpm test && pnpm build; audit-cli against a database (docs/RUNNER.md, "Verify the market record")
Files touched: packages/cop/src/{chain,chain.test,index}.ts, spacetimedb/spacetimedb/src/index.ts, packages/bindings/src/*, apps/runner/src/audit-cli.ts, apps/web/app/screen/AlertFeed.tsx, docs/{LIMITATIONS,RUNNER,DECISIONS}.md, HANDOFF.md

---

## [T24] admin_reset_market, Claude Code -> next
Branch: main (module change NOT yet published to Maincloud)
Done: admin_reset_market(marketId) deletes the market's orders, trades, positions, event log, news, all alerts and every human account; bots stay at 10,000 cash; in-database bots restart from a fresh state. spacetimedb/test/reset.test.ts (live, needs PIT_TEST_DATABASE + ADMIN_TOKEN) passes, including "admin only" for players. Locally: reset of a live bot market took 16 ms and bots resumed trading within seconds (audit passed); 30k orders + 15k trades + 45k events reset in 114 ms. T24 ticked (QR and starting cash were already done).
Not done / next: Publish to Maincloud, then run `spacetime call the-pit-mhacks-2026 admin_reset_market 1 --server maincloud` right before judging. No web button: admin token must not reach the browser.
Gotchas: Reset is irreversible and deletes players; tell anyone mid-test first.
How to verify: pnpm test && pnpm build; live: run spacetimedb/test/reset.test.ts against a local database
Files touched: spacetimedb/spacetimedb/src/index.ts, spacetimedb/test/reset.test.ts, docs/RUNNER.md, TODO.md, HANDOFF.md

---

## [D9] Bots and Cop inside SpacetimeDB, Claude Code -> next
Branch: main (module change NOT yet published to Maincloud; in-database bots are off until admin_bots_start)
Done: packages/bots/src/liveTick.ts (pure, tested) plans each tick like the runner. Module: scheduled bot_tick (1 s), admin_bots_start(adaptive)/admin_bots_stop, sim_state, alert_incident, event_log.ts index; Cop runs in cancel_order/cancel_all (scoped to the canceller) and per tick; bots' rejected orders are skipped, not fatal. Local verification: market ran 15+ min with no runner (590 trades, 47 news, open orders bounded), audit passed, live spoofs caught 8/8 in 7-10 ms with 0 alerts on bots, cop-path test passes in 31 ms on a quiet DB, in-place upgrade over a running bot DB worked. Latency in docs/LOAD_TEST.md.
Not done / next: Switch Maincloud (docs/RUNNER.md, "In-database bots"): stop runner task, publish without --delete-data, call admin_bots_start. Then delete the runner bot loop. cop-path.test.ts hard-codes prices near 100, so run it on a quiet database (bots off); its PIT_COP_RUNNER_ACTIVE flag no longer needs a runner.
Gotchas: Never run the runner and the in-database bots together. Cancel cost grows with the last 30 s of market activity (1.8 ms live, ~49 ms under a 10k-order flood); fix is an (owner, ts) index. The module now depends on @the-pit/bots and @the-pit/cop.
How to verify: pnpm test && pnpm build; local server + publish + `spacetime call <db> admin_bots_start true`
Files touched: spacetimedb/spacetimedb/{src/index.ts,package.json}, packages/bots/src/{liveTick,liveTick.test,index}.ts, packages/cop/src/marketWatch.ts, pnpm-lock.yaml, docs/{RUNNER,LOAD_TEST,DECISIONS}.md, HANDOFF.md

---

## [Real-data eval] Tournament + Cop on real price paths, Claude Code -> next
Branch: main
Done: packages/bots/src/realDataEval.test.ts (PIT_EVAL_REAL=1, ~25 s) runs all bots + trained AI on the 171 held-out real paths, with/without the spoofer and both evasive variants, and writes docs/REAL_DATA_EVAL.md. Cop: 171/171 caught, 0 false alarms (MM and AI included); evasive 0/171. Leaderboard (no spoofer): MM +102, noise +8..+16, AI -52, informed -88. With spoofer: spoofer +67, AI -124.
Not done / next: Live real-data mode for the runner (replay paths as the live hidden value) is not built; roadmap item.
Gotchas: AI profit varies with seeds (-30 in ADAPTIVE_EVAL vs -52 here on the same paths).
How to verify: PIT_EVAL_REAL=1 pnpm exec vitest run packages/bots/src/realDataEval.test.ts (check mode)
Files touched: packages/bots/src/realDataEval.test.ts, docs/{REAL_DATA_EVAL,EVALUATION,LIMITATIONS}.md, HANDOFF.md

---

## [Real market] The Cop's eyes on live BTC, Claude Code -> next
Branch: main
Done: packages/cop/src/marketWatch.ts (pure, tested): rolling 60 s rates, share cancelled untraded, and "flash orders" (>= 3x median size, <= 50 bp from last trade, gone <= 5 s, never filled). apps/web/lib/bitstamp.ts parses Bitstamp's public live_orders/live_trades feed (tested against real message shapes); useMarketWatch connects the browser directly (no server, no key); new /screen section "The Cop's eyes on live BTC". Verified on 75 s of the real feed: ~87 orders/s, 99.75% cancelled untraded, flash orders found.
Not done / next: Not seen in a real browser here; check the panel on the next preview. If venue Wi-Fi blocks wss://ws.bitstamp.net the panel says so. Kill switch: NEXT_PUBLIC_MARKET_WATCH=false.
Gotchas: Coinbase's "full" feed needs authentication now, so Bitstamp is used. No account ids in public feeds, so the spoofing rule cannot run there; the caption says so. apps/web now depends on @the-pit/cop (package.json, lockfile link, transpilePackages).
How to verify: pnpm test && pnpm build; open /screen
Files touched: packages/cop/src/{marketWatch,marketWatch.test,index}.ts, apps/web/lib/{bitstamp,bitstamp.test,useMarketWatch}.ts, apps/web/app/screen/{MarketWatchPanel,page}.tsx, apps/web/{package.json,next.config.ts}, pnpm-lock.yaml, docs/LIMITATIONS.md, HANDOFF.md

---

## [Scaling 2] Pages download only what they render, Claude Code -> next
Branch: main
Done: apps/web/lib/subscriptions.ts: open orders, last 10 min of trades (phones) / 30 min (Big Screen), last 2 min of orders for tape colours; cutoff rolls forward every minute. Ticker, TradePanel and MarketBoard use it. Benchmark (apps/runner/src/subscription-bench.ts, docs/LOAD_TEST.md) on 50k-order history: phone page load 151,808 rows / ~38 MB / 641 ms -> 1,208 rows / ~0.3 MB / 8.7 ms. Big Screen stats relabelled "30 min".
Not done / next: Not checked in a real browser (no browser here): during the multi-device test, confirm book, tape colours, chart and leaderboard render, and watch for a brief flicker when the cutoff rolls each minute. If it flickers, stop rolling the trade cutoff. Ticker still opens its own connection; sharing one connection per page would halve connections.
Gotchas: Web-only change: goes live with a normal Vercel deploy, no database publish needed. Leaderboard, alerts and news still use full tables (they grow with players, not trades).
How to verify: pnpm test && pnpm build; open /trade and /screen against a database with history.
Files touched: apps/web/lib/subscriptions.ts, apps/web/app/{Ticker.tsx,trade/TradePanel.tsx,screen/MarketBoard.tsx}, apps/runner/src/subscription-bench.ts, docs/LOAD_TEST.md, HANDOFF.md

---

## [Scaling] place_order no longer slows down with history, Claude Code -> next
Branch: main
Done: Module reads only open orders (btree index on order.status), only the caller's and resting-order owners' accounts/positions, and keeps the last trade price in a private market_state table. Benchmark (apps/runner/src/history-bench.ts, docs/LOAD_TEST.md): p50 at 50k historical orders 15.3 ms -> 1.3 ms; flat to 100k. In-place upgrade over a 50k-order database tested (no data loss); audit passed; all three live acceptance tests passed locally.
Not done / next: Publish to Maincloud (Shafir, the database owner): `spacetime publish the-pit-mhacks-2026 --module-path spacetimedb/spacetimedb --server maincloud` WITHOUT --delete-data (check the server nickname with `spacetime server list`). Team call on timing vs the 6 AM freeze. Bindings were not regenerated (market_state is private; clients need no change).
Gotchas: My local `spacetime generate` also emits private-table types (IdCounter, MarketState) that the committed bindings omit, so I reverted it; regenerate on the usual machine if needed. The first order after the upgrade rebuilds market_state from the trade table once.
How to verify: pnpm test && pnpm build; see the Reproduce section in docs/LOAD_TEST.md
Files touched: spacetimedb/spacetimedb/src/index.ts, apps/runner/src/history-bench.ts, docs/LOAD_TEST.md, HANDOFF.md

---

## [T31 alt] News strategy for the adaptive AI, Claude Code -> next
Branch: main
Done: worldNews now posts "Delayed estimate: HACK fair value about N." (same 5 s delay, +/-5 noise, same single rng draw); parseNewsHint reads it (old firm/softer lines give null). Fifth arm 'news' trades toward a fresh hint far enough from the mid. runSession simulates news (own rng; event log unchanged). Retrained on 30 days of data (572 paths): held out -30 with news, -39 without, -202 untrained, 0 flat, news alone -2; 0 Cop alerts. Arms can be switched off via AdaptiveParams.arms.
Not done / next: Validation chose newsMaxAgeMs 1000; live, the runner sees a new news row about one tick late, so the news arm will rarely fire there (harmless). The Big Screen news text changes on the next runner restart, flag or not.
Gotchas: Training now takes about 2.5 min (PIT_TRAIN=1). Public news is effectively priced in by the informed bot; see docs/ADAPTIVE_EVAL.md.
How to verify: pnpm test && pnpm build; PIT_TRAIN=1 pnpm exec vitest run packages/bots/src/adaptiveTraining.test.ts (check mode)
Files touched: packages/bots/src/{world,world.test,index.test,adaptiveTrader,adaptiveTrader.test,adaptiveTraining.test,adaptivePriors,streamSim}.ts, packages/bots/data/pricePaths.json, apps/runner/src/index.ts, docs/{ADAPTIVE_EVAL,LIMITATIONS}.md, HANDOFF.md

---

## [T31 alt] Adaptive AI trader + real price paths, Claude Code -> next
Branch: main
Done: scripts/fetch-price-paths.mjs pulls Coinbase 1-min candles (no key) into 188 rescaled 300-step paths (packages/bots/data/pricePaths.json; raw cache in .tools/). adaptiveTrader.ts: discounted Thompson bandit over make/momentum/revert/flat, public info only, max 1 order per side, position cap 150. runSession adds fundamentalPath, adaptive and per-owner PnL (runStream unchanged, fixture identical). Training (PIT_TRAIN=1) fits priors on 70% of paths + 50 synthetic sessions, tunes on a validation slice, and writes adaptivePriors.ts + docs/ADAPTIVE_EVAL.md. Held out: -56 mean vs -229 untrained, 0 for flat (MM +124, informed -85 in the same sessions); 0 Cop alerts. Runner hook behind PIT_ADAPTIVE_BOT=true (default off).
Not done / next: Live runner run with the flag (needs the runner PC). Team call on enabling it for judging (past the planned freeze?).
Gotchas: Training is slow (~40 s), so it is skipped in pnpm test. ADAPTIVE_EVAL.md lists the held-out results of two earlier versions.
How to verify: pnpm test && pnpm build; PIT_TRAIN=1 pnpm exec vitest run packages/bots/src/adaptiveTraining.test.ts
Files touched: scripts/fetch-price-paths.mjs, packages/bots/{data/pricePaths.json,src/adaptive*.ts,src/streamSim.ts,src/index.ts}, apps/runner/src/index.ts, .env.example, docs/{ADAPTIVE_EVAL,LIMITATIONS,RUNNER}.md, HANDOFF.md

---

## [Backend verification] 04:20 CEST, Codex -> next
Branch: main (acceptance 7f1ae91, audit de35931, load 0c2141f, CI 06cdd9c pushed)
Done: Added a one-command localhost acceptance run with a temporary SpacetimeDB server and runner. It uses a localhost-issued admin token in an isolated CLI config, tests exchange writes, admin authorization and Cop evidence, audits balances/orders/events, and removes temporary credentials. A read-only audit passed on Maincloud (11 accounts, ~26.8k orders, ~6.7k trades, ~53.6k events, 5 alerts). A 20-client disposable load run with five bots completed 200 IOC orders (p95 28 ms on a fresh database) and passed the post-load audit. Added a Windows GitHub Actions workflow with a pinned, checksum-verified SpacetimeDB binary and no secrets.
Not done / next: T28 remains open for reconnect handling and production-sized history measurement. No matching-rule or schema changes were made. First hosted `Backend checks / verify` run passed. GitHub refused both branch protection and rulesets on this private repository with a `403` requiring GitHub Pro or a public repository, so the team must manually review the check before merging.
Gotchas: Fresh-database latency is not a production capacity estimate. The live Windows runner was not restarted. The test script requires free localhost port 3000.
How to verify: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-integration.ps1 -Load`; `pnpm test`; `pnpm build`.
Files touched: scripts/test-local-integration.ps1, apps/runner/src/{audit,audit-cli,load-test}.ts, their tests, three live acceptance tests, docs/{CLI,LOAD_TEST}.md, .github/workflows/backend.yml, HANDOFF.md.

---

## [T22 part, P2] Narrator text + evasive spoofer, Claude Code -> next
Branch: main
Done: POST /api/narrate (apps/web/app/api/narrate/route.ts): alert evidence -> facts -> Claude (claude-opus-5-5, effort low, fallbacks "default") -> one sentence of 25 words or fewer. Template fallback when NARRATOR_ENABLED=false, LLM_API_KEY is missing, on error, refusal, timeout (8 s), rate limit (1 call / 6 s), or if the text has a number not in the facts. In-memory cache. /screen AlertFeed fetches it per new alert. runStream takes spooferParams; docs/LIMITATIONS.md has the evasion table (trade 4 s after layering or cancel 6 s after the trade: 0/50 caught) and a one-line judge answer.
Not done / next: ElevenLabs audio + browser speech (rest of T22), so T22 stays unticked. Team decision: no LLM key, so leave LLM_API_KEY unset and the narrator always uses the template. Adding an Anthropic key later turns the LLM path on with no code change (untested live). README (T33) should paste docs/LIMITATIONS.md.
Gotchas: Plain fetch, no SDK (no new dependency). Cache and rate limit are per server instance.
How to verify: pnpm test && pnpm build; POST /api/narrate with an alert body.
Files touched: apps/web/lib/narrator{,.test}.ts, apps/web/app/api/narrate/route.ts, apps/web/app/screen/AlertFeed.tsx, packages/bots/src/{streamSim,copStreams.test}.ts, docs/LIMITATIONS.md, HANDOFF.md

---

## [T35] 20:00 EDT, Claude chat -> next
Branch: fe/t35-beat-cop
Done: Beat the Cop. /trade has a 60 s challenge panel (app/trade/BeatTheCop.tsx): Start, countdown, live profit/caught/score, final result. Score = profit (cash + position at mid) minus 500 per Cop alert raised against you during the 60 s (alert count read from the alert table). /screen has a "Beat the Cop" card (humans only): profit vs 10,000 minus 500 per alert (all time), top 5, "caught N x". Penalty lives in apps/web/lib/copScore.ts. No backend changes.
Not done / next: needs the Cop running against the live DB, otherwise nobody is ever "caught" and the score is just profit. Leaderboard "tab" is a card, not a tab. T30/T36 3D X-ray is next if time (cut first).
Gotchas: Score uses the mid price for the open position, so it moves with the market. The all-time /screen score is not reset per challenge.
How to verify: pnpm --filter web build, join on a preview, press Start the challenge on /trade, use Try to cheat, watch the Beat the Cop card on /screen
Files touched: apps/web/app/trade/{BeatTheCop,TradePanel}.tsx, apps/web/app/screen/MarketBoard.tsx, apps/web/lib/copScore.ts (new), apps/web/app/globals.css (appended), TODO.md, HANDOFF.md

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
