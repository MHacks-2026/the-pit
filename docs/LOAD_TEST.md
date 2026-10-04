# Disposable database load check

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-integration.ps1 -Load` on Windows. The script creates an in-memory localhost database, starts five bots, connects 20 additional clients, submits 10 one-unit market IOC buys per client, and audits the resulting exchange state. It refuses a cloud database URL. No production data is changed.

## Baseline, 2026-10-04

On Shafir's Windows PC with SpacetimeDB 2.10.2, 200 concurrent-by-round orders completed without reducer errors. Measured reducer response times were p50 16 ms, p95 28 ms, max 29 ms. The run added 200 order rows, 9 trade rows, and 400 event rows; the post-load cash, position, fill, event, and alert audit passed.

This is one short run on a fresh database, not a production-sized history benchmark or a capacity guarantee. Maincloud already has tens of thousands of historical orders and events. Measure that scale in a disposable database before changing the book-loading or subscription design. The 200 IOC orders generated 400 event rows even though only 9 trades occurred, so sustained order spam can grow history quickly.

## History benchmark: order latency vs. exchange history (2026-10-04)

**Question:** does placing an order get slower as the market accumulates history? Before this fix, every `place_order`,
`cancel_order` and `cancel_all` scanned the whole `account`, `order` and `trade` tables (the trade scan only to find the last
trade price), so yes. The fix reads only open orders (new btree index on `order.status`), only the accounts and positions of
the caller and resting-order owners (primary-key lookups), and keeps the last trade price in a private `market_state` table.

**Method:** `apps/runner/src/history-bench.ts` on a disposable in-memory SpacetimeDB 2.10.2 server (MacBook, localhost).
History is built through the real `place_order` reducer: two accounts trade 1 unit at 100 back and forth (inside every risk
limit). At each checkpoint it pauses and times 200 sequential `place_order` round trips (half resting GTC sells, half
crossing IOC buys). At 50,000 orders the database held 50,200 orders, 25,100 trades and 75,300 event_log rows (~150,600 rows).

| Historical orders | Before: p50 / p95 | After (fresh database): p50 / p95 | After (same data, upgraded in place) |
|---|---|---|---|
| 0 | 1.4 / 1.4 ms | 1.3 / 1.4 ms | |
| 10,000 | 3.2 / 3.6 ms | 1.4 / 1.5 ms | |
| 25,000 | 7.7 / 7.8 ms | 1.4 / 1.5 ms | |
| 50,000 | **15.3 / 15.7 ms** | **1.3 / 1.5 ms** | 1.4 / 1.4 ms |
| 75,000 | not run | not run | 1.4 / 1.5 ms |
| 100,000 | not run | not run | 1.4 / 1.5 ms |

Before, latency grew linearly with history (11x slower at 50,000 orders) and history build-up throughput fell from 526 to
87 orders/s. After, latency is flat and throughput holds at about 765 orders/s. Sequential round trips on one machine, not
a capacity guarantee; the live Maincloud server and network add their own latency.

**Upgrade path (tested):** publishing the fixed module over the old one on the 50,000-order database migrated in place
(`spacetime publish` created `market_state` and the `order_status_idx_btree` index, no data loss). The first order after the
upgrade rebuilt `market_state` from the trade table once (the 12.6 ms max sample); every later order was ~1.4 ms.

**Correctness checks after the fix:** `audit-cli.ts` passed on the upgraded database (100,200 orders, 50,100 trades, 150,300
events: every account's cash and position match its trades), and on a fresh database the three live acceptance tests passed
(`spacetimedb/test/integration.test.ts`, `apps/runner/test/integration.test.ts`, and `apps/runner/test/cop-path.test.ts`
with the runner and the adaptive bot connected), followed by a passing audit.

**Reproduce:** start a disposable server (`spacetime start --in-memory --listen-addr 127.0.0.1:3123 --data-dir <tmp>`), get a
token from `POST /v1/identity`, `spacetime --config-path=<tmp>/cli.toml login --token <token>`, publish to a `pit-bench-*`
database, then from `apps/runner`:
`PIT_BENCH_URI=ws://127.0.0.1:3123 PIT_BENCH_DB=pit-bench-<id> node --import tsx src/history-bench.ts`.

## Subscription benchmark: what a phone downloads on page load (2026-10-04)

**Question:** how much data does a page pull before it can render? Before this change every page subscribed to the full
`order` and `trade` tables, and the `Ticker` (shown on `/join`, `/trade` and `/screen`) opens its own connection, so a phone
downloaded the whole order and trade history twice. Now pages subscribe through `apps/web/lib/subscriptions.ts`: open
orders, the last 10 minutes of trades on phones (30 on the Big Screen), and the last 2 minutes of orders (only so tape rows
can show the taker's side). The cutoff rolls forward every minute, so a page left open stays bounded too.

**Method:** `apps/runner/src/subscription-bench.ts` on a disposable local SpacetimeDB 2.10.2 server. 50,000 orders of
history (50,600 orders and 25,300 trades), then a cutoff, then a deliberately generous "recent" burst of 600 orders and 300
trades (more than the live bots produce in 10 minutes). For each page it opens the same connections with the same query
objects the React hooks use, and measures rows received and time from subscribe to applied (median of 5).

| Page load | Before: rows / data / time | After: rows / data / time |
|---|---|---|
| Phone `/trade` (2 connections) | 151,808 / ~38 MB / 641 ms | **1,208 / ~0.3 MB / 8.7 ms** |
| Big Screen `/screen` (3 connections) | 151,810 / ~38 MB / 658 ms | **1,810 / ~0.5 MB / 11.4 ms** |

Data size is the rows measured as JSON; the wire format is a more compact binary, so absolute sizes are smaller but the
ratio holds. Times are on localhost; over a phone network the difference is far larger. After the change, what a page
downloads depends on recent activity, not on how long the market has run.

Visible change: the Big Screen's High, Low, Volume, Trades and change figures now cover the last 30 minutes (labelled
"30 min") instead of all history.

## In-database Cop: cost per call (2026-10-04)

The Cop now runs inside `cancel_order` and `cancel_all` (scoped to the canceller) and once per `bot_tick`. A spoof
completes only when its layers are cancelled after the opposite trade, so `place_order` does no Cop work. It reads the
last 30 s of `event_log` through a btree index on `ts`. Local SpacetimeDB 2.10.2, sequential calls:

| Condition | place_order p50 / p95 | cancel_all p50 / p95 |
|---|---|---|
| Live market (in-database bots trading) | 1.4 / 1.4 ms | 1.8 / 2.4 ms |
| Flood: 2,000 orders in the last 3 s (~6,000 events in the window) | 1.3 / 1.4 ms | 10.0 / 14.2 ms |
| Flood: 10,000 orders in the last 13 s (~30,000 events) | 1.4 / 1.4 ms | 48.9 / 52.5 ms |

Live spoofs against the bot market (three layers behind the ask, an opposite IOC buy, cancel all) were alerted 7 to 10 ms
after the first layer, in the same transaction as the cancel. Limit: cancel cost grows with the last 30 s of market-wide
activity, because every event in the window is read; the flood rows are about 75x a busy demo. Fix if needed: an
`(owner, ts)` index on event_log plus maker/taker lookups on trade, so the Cop reads only the canceller's rows.

