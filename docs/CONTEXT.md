# CONTEXT.md: paste this into any chat bot that cannot see the repo (under 700 words)

We are four people at MHacks 2026 (24-hour hackathon, University of Michigan). Hacking: Sat 12:00 PM to Sun 12:00 PM.
Judging Sun 12:30 to 3:00 PM at tables. We are building THE PIT.

THE PIT: a live multiplayer play-money exchange. Judges and hackers join from phones (QR code) and trade against AI bots.
An AI "Market Cop" detects manipulation (spoofing/layering first) from the order stream and explains each alert out loud
(LLM text grounded in a structured evidence JSON, spoken with ElevenLabs).

Stack: TypeScript, pnpm workspaces, Next.js on Vercel (apps/web), SpacetimeDB TypeScript module (spacetimedb/),
Node runner for bots (apps/runner), pure packages: packages/engine (matching), packages/bots (strategies), packages/cop (detectors).
Vitest for tests. LLM + ElevenLabs only from server routes.

Key rules: integer ticks and quantities; pure deterministic engine with injected clock and id counter;
engine/bots/cop have no network or Spacetime imports; no new dependencies without asking.

Prizes targeted: FinTech track, Grand Prize, SpacetimeDB sponsor, ElevenLabs sponsor. Side quest: Judged by an LLM (README quality).

Roles: Integrator (engine, bots, cop, merges), Backend (Spacetime module, runner), Frontend (phone UI, Big Screen, charts),
Pitcher/integrator (narrator, voice, Devpost, README, demo).

Current gate: <fill in: G0 / G1 / G2 / G3 / G4 / G5>.
Open problems: <fill in>.
Ask: act as planner/reviewer. Do not write full files unless asked.
