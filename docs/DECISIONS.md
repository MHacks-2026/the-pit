# DECISIONS.md

One line per decision, with the reason. Newest at the bottom.

- D1 Project: THE PIT (live exchange + AI Market Cop). Reason: fits our skills, participatory demo, fits FinTech + Spacetime.
- D2 Backend: SpacetimeDB (TypeScript module). Engine logic lives in pure packages/engine and is called by reducers.
- D3 Sponsor targets: SpacetimeDB, ElevenLabs. Others only if integration is under 1 hour and genuine. (Confirm at 11:45 AM.)
- D4 Cut order when behind: LLM persona trader, 3D surface, extra detectors, event markets, informed bot, ElevenLabs (use browser TTS), leaderboard polish, chart polish.
- D5 Never cut: engine, Market Maker + Noise bots, live sync, phone join, spoofing detector with evidence alert, Try-to-cheat / Beat-the-Cop, README evaluation table.
- D6 Feature freeze Sunday 6:00 AM. Submit Sunday 10:00 AM (deadline is 12:00 PM).
- D7 Play money only. No real money or real brokerage data, ever.
- D8 Track: FinTech (plus Grand Prize). Reason: a live exchange with manipulation surveillance is a fintech product; sponsor prizes stay as in D3.
- D9 Bots and the Market Cop run inside the SpacetimeDB module (scheduled bot_tick; Cop in the cancel transaction). Reason: no PC to keep awake during judging, alerts land atomically with the spoof, one deployable backend. The runner stays as a fallback until Maincloud is switched over.
- D10 The event log is a SHA-256 hash chain (event_chain, chain_head), written in the same transaction as each event and verified by audit-cli. Reason: trading records must be provably unaltered; the live head on the Big Screen makes later rewrites detectable.
