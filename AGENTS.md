# AGENTS.md: THE PIT

Project: a live multiplayer play-money exchange (humans on phones + AI bots) with an AI "Market Cop"
that detects manipulation (spoofing/layering first) and explains it out loud. Play money only.

## Stack
TypeScript everywhere. pnpm workspaces. Next.js (App Router) + Tailwind in apps/web.
SpacetimeDB TypeScript module in spacetimedb/ (tables + reducers). Vitest for tests.
Vercel for deploy. ElevenLabs + an LLM API are called ONLY from server routes (apps/web/app/api).

## Hard rules
1. Do NOT add or upgrade dependencies without asking in the team chat. Only the integrator edits package.json and pnpm-lock.yaml.
2. Stay inside the folder you were assigned. If you must change a shared contract (docs/spec.md), stop and ask.
3. packages/engine, packages/bots, packages/cop must stay PURE: no network, no Spacetime imports, no Date.now() / Math.random()
   (inject a clock and an rng). Every exported function gets a Vitest test.
4. Never commit secrets. Read env vars by the names in .env.example.
5. Prices are integer ticks, quantities are integers. Never use floats for money in the engine.
6. Keep PRs small. Run `pnpm test` and `pnpm build` before pushing.
7. If you fail the same task twice, stop and report what you tried. Do not thrash.
8. Before ending a session, add an entry at the top of HANDOFF.md (template inside that file).

## Contracts
docs/spec.md defines the Order, Trade and Alert types, the engine API, table names and reducer signatures.

## Definition of done for a ticket
Acceptance test in the ticket passes, tests green, preview deploy works, ticket checked off in TODO.md.

## How to run
pnpm install; pnpm test; pnpm --filter web dev; spacetime dev (module); pnpm --filter runner start
