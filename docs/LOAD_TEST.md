# Disposable database load check

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-integration.ps1 -Load` on Windows. The script creates an in-memory localhost database, starts five bots, connects 20 additional clients, submits 10 one-unit market IOC buys per client, and audits the resulting exchange state. It refuses a cloud database URL. No production data is changed.

## Baseline, 2026-10-04

On Shafir's Windows PC with SpacetimeDB 2.10.2, 200 concurrent-by-round orders completed without reducer errors. Measured reducer response times were p50 16 ms, p95 28 ms, max 29 ms. The run added 200 order rows, 9 trade rows, and 400 event rows; the post-load cash, position, fill, event, and alert audit passed.

This is one short run on a fresh database, not a production-sized history benchmark or a capacity guarantee. Maincloud already has tens of thousands of historical orders and events. Measure that scale in a disposable database before changing the book-loading or subscription design. The 200 IOC orders generated 400 event rows even though only 9 trades occurred, so sustained order spam can grow history quickly.
