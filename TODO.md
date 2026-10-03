# TODO.md: ticket board
Owners: YOU (integrator), BE (backend), FE (frontend), PI (pitcher/integrator). Tools: CC Claude Code, CU Cursor, CX Codex, DV Devin.
Gates: G1 2:15 PM target (2:30 hard) | G2 8:00 PM | G3 12:00 AM | G4 6:00 AM freeze | G5 10:00 AM submit.

## Phase 0: launch (12:00 to 12:15)
- [ ] T00 YOU: create the-pit repo, copy starter files, invite team, protect main, link Vercel
- [ ] T01 BE or FE (CC): scaffold pnpm workspace (packages/engine, bots, cop; apps/web; apps/runner; Vitest). pnpm test + build pass on a clean clone
- [ ] T02 YOU: confirm docs/spec.md, create demo-script draft, hand out first prompts (docs/PROMPTS.md)

## Phase 1: contracts and skeleton (12:15 to 2:15)  -> G1
- [ ] T03 YOU (CC): engine core: types, limit orders, price-time priority, partial fills
- [ ] T04 YOU (CC): engine: IOC, MARKET, cancel, self-trade prevention, risk rejects + property test
- [x] T05 BE (CC/CU): Spacetime module: tables, join, stubs; publish; generate bindings
- [ ] T06 FE (CU): web skeleton: /join, /trade, /screen with mock data behind an interface
- [ ] T07 PI (CX): Vercel deploy, env wiring, QR component on /screen
- [ ] T08 PI (CX): /api/narrate stub with template fallback and NARRATOR_ENABLED kill switch

## Phase 2: core loop (2:15 to 6:00)
- [ ] T09 BE+YOU (CC): wire engine into place_order/cancel_order; atomic writes to trade, position, cash, event_log
- [ ] T10 FE (CU): client subscriptions: live order book and tape
- [ ] T11 YOU (CC): Market Maker (Avellaneda-Stoikov) pure function + tests
- [ ] T12 BE (CC): noise trader + runner process connecting N bot identities on timers
- [ ] T13 FE (CU): phone trade UI wired (buy/sell, steppers, positions, open orders, cancel)
- [ ] T14 FE (CU): price chart and 2D depth chart on /screen
- [ ] T15 PI (DV): isolated: engine test fixtures + property tests
- [ ] T16 BE: attend the Spacetime workshop (~5 PM, confirm) and post 3 tips

## Phase 3: Cop v1 and Big Screen (6:00 to 8:00)  -> G2
- [ ] T17 YOU (CC)+BE: world simulator (hidden fundamental + jumps), news rows, informed bot
- [ ] T18 YOU (CC): Cop: feature extraction + spoofing detector + synthetic stream tests (MM must NOT be flagged)
- [ ] T19 YOU (CC): Spoofer bot (layer, trade opposite side, cancel)
- [ ] T20 FE (CU): Big Screen layout: book, tape, chart, alert feed, leaderboard shell

## Phase 4: integration (8:00 PM to midnight)
- [ ] T21 BE+YOU: Cop runner calls admin_raise_alert; alert feed UI
- [ ] T22 PI (CX/CC): LLM explanation from evidence JSON; narrator with ElevenLabs; cache + rate limit
- [ ] T23 FE (CU): Try-to-cheat button (preset layering macro)
- [ ] T24 PI+FE: join flow polish (QR on Big Screen, starting cash, admin reset-market)
- [ ] T25 FE (CU): leaderboard (mark-to-market PnL), robot badge for bots
- [ ] T26 ALL: Rehearsal R0 (11:30 PM)
- [ ] T34 PI (CX): citation card: LLM text from evidence + canvas card + download; template fallback
- [ ] T35 FE (CU): Beat the Cop: 60 s challenge, evasion score, leaderboard tab

## Phase 5/6: hardening and wow (midnight to 6:00 AM)  -> G3 at 12:00 AM
- [ ] T27 PI+BE: event markets (2 binary) + admin settle; voice polish, mute, fallbacks
- [ ] T28 BE (CC): load test (20 simulated clients + bots); reconnect handling
- [ ] T29 YOU (CC): evaluation harness: N sessions with/without spoofer; precision and recall; MM negative control
- [ ] T30/T36 FE+YOU: phantomScore + 3D X-ray with 2D fallback (1 to 4 AM)
- [ ] T31 YOU: extra detectors + LLM persona trader (only if everything is green)
- [ ] T32 BE: error boundaries, rate limits, kill switches, replay mode for Big Screen
- [ ] T33 PI: README with architecture diagram, eval table, mocked-vs-real, setup steps
- [ ] T37 BE (optional): mic oracle market (clap to move the market)

## Sunday
- [ ] 6:00 AM G4 freeze | 7:00 R2 rehearsal | 8:00 backup video | 8:15 Devpost final | 9:00 stress test | 9:30 submit G5 | 10:00 brunch
- [ ] 10:45 judging table setup (Duderstadt Basement) | 11:15 R3 | 12:00 submissions close | 12:30 to 3:00 judging
