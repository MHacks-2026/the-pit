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
