# PROMPTS.md: first-wave and handoff prompts

Paste into a FRESH session of the named tool at 12:00 PM or later. Every prompt makes the agent plan first.

## A1. YOU, Claude Code: packages/engine
Read AGENTS.md and docs/spec.md. Plan first: list the types, the matchOrder/cancelOrder API, and your test cases.
Wait for my OK. Then implement packages/engine as PURE TypeScript: LIMIT, IOC, MARKET, CANCEL, price-time priority,
partial fills, maker-price execution, self-trade prevention (emit self_trade_attempt), risk checks (reject with reason).
Inject clock and id counter. Write Vitest tests: partial fills across levels, FIFO at a level, IOC remainder cancel,
self-trade prevention, and a property test that random order flow never crosses the book or loses quantity.
Do not install dependencies other than vitest.

## A2. Backend, Claude Code or Cursor: spacetimedb module
Read AGENTS.md and docs/spec.md. Plan first. Using the SpacetimeDB TypeScript module library (spacetimedb/server),
create tables: account, market, order, trade, position, event_log, alert, news and reducers: join, place_order,
cancel_order, cancel_all, admin_settle, admin_reset_market, admin_register_bot, admin_raise_alert, admin_post_news.
For now place_order must call a stub matchOrder from packages/engine's interface. Publish to a local database,
generate client bindings, and show me how to call each reducer with the spacetime CLI.

## A3. Frontend, Cursor: apps/web
Read AGENTS.md. Build a Next.js App Router app with three routes: /join (name entry, QR code for this URL),
/trade (phone UI: big Buy/Sell buttons, price/qty steppers, my positions and open orders), /screen (Big Screen:
order book depth, trade tape, price chart, leaderboard, alert feed placeholder). Use mock data now behind an interface
so we can swap in Spacetime subscriptions. Mobile-first. Dark mode. No new dependencies except Tailwind and a small chart library.

## A4. Pitcher/integrator, Codex: narrator route
Read AGENTS.md. Create POST /api/narrate in apps/web. Input: compact JSON of recent trades, spread, imbalance, optional alert.
Call the LLM with a system prompt: sports commentator, max 25 words, use ONLY facts in the JSON. Then call ElevenLabs text-to-speech
and return audio. Add: server rate limit (1 call / 6s), cache by event hash, NARRATOR_ENABLED kill switch,
fallback to text only. Keys only from env. Include a unit test with a mocked fetch.

## H1. Handoff prompt (give to the tool you are leaving, if it still works)
Stop coding. Add an entry at the TOP of HANDOFF.md for ticket <ID> using the template in that file and nothing else.
Under 200 words. Commit it as "handoff: <ID>". Make no other changes.

## H2. Resume prompt (give to the next tool)
Read AGENTS.md, docs/spec.md and the top entry of HANDOFF.md. Run pnpm test to see the current state.
Summarize in 5 lines what is done and what remains. Wait for my OK. Then continue ticket <ID> only.

## H3. If the old tool is rate-limited, write the handoff yourself from:
git status -sb ; git log -3 --stat ; git diff main --stat
