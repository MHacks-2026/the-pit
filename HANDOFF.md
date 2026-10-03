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

## [T05, T09, T12, T21] 19:58 CEST, Codex -> next
Branch: main (pushed, last commit b5dc215)
Done: Private repo populated; SpacetimeDB module, generated bindings, atomic matching reducers, bot runner, pure Cop detector, admin alert reducer, and live `/screen` alert feed. T05/T09/T12/T21 checked in TODO.md. A concurrent bot strategy commit was merged; package exports restored and new market maker state made immutable.
Not done / next: Vercel preview is not linked. Remaining tickets in TODO.md belong to the broader project.
Gotchas: Use a disposable database for integration tests. Persistent orders can invalidate order assumptions and eventually hit open-order limits. Keep ADMIN_TOKEN and runner token file outside Git.
How to verify: `pnpm test && pnpm build`; for live tests start local SpacetimeDB, publish a fresh database, set `PIT_TEST_DATABASE` and `ADMIN_TOKEN`, run the two integration tests, then start the runner and run `apps/runner/test/cop-path.test.ts` with `PIT_COP_RUNNER_ACTIVE=true`.
Files touched: spacetimedb module, packages/engine, packages/bots, packages/cop, packages/bindings, apps/runner, apps/web, docs/CLI.md, docs/RUNNER.md, TODO.md.

---
