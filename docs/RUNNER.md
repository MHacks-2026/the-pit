# Runner setup

Publish the SpacetimeDB module with an authenticated owner identity, then generate bindings (see [CLI.md](CLI.md)). Set `NEXT_PUBLIC_SPACETIME_URI` and `NEXT_PUBLIC_SPACETIME_DB` to that server and database. Set `ADMIN_TOKEN` to the publisher's token. Keep real values in your local environment or secret manager, never in Git.

Run `pnpm --filter runner start`. The runner connects one market maker, `PIT_BOT_COUNT` noise traders, and one informed trader as separate clients. It calls `admin_register_bot` from the admin connection, renews market maker quotes each second, generates Poisson noise orders, moves a hidden fundamental, and posts delayed news. `PIT_SEED` fixes the bot strategy random stream. The token file at `PIT_RUNNER_TOKEN_FILE` is gitignored and preserves each bot identity across restarts.

For a local integration test, use a disposable local database and set `PIT_TEST_DATABASE` plus `ADMIN_TOKEN`, then run `pnpm test`. The test connects a distinct bot identity, registers it, places an order, and posts news.

The same runner subscribes to `event_log`, scans a rolling 30-second window for spoofing, and calls `admin_raise_alert` once per incident. The pure detector is in `packages/cop`; its evidence includes the layer orders, opposite trade, and cancellation quantities. `/screen` subscribes to public `alert` rows and displays the evidence. To run the live Cop acceptance test against a disposable local database, set `PIT_COP_RUNNER_ACTIVE=true` alongside `PIT_TEST_DATABASE` and `ADMIN_TOKEN` while the runner is active.

For the Vercel screen, configure `NEXT_PUBLIC_SPACETIME_URI` as a browser-reachable `wss://` endpoint and `NEXT_PUBLIC_SPACETIME_DB` as the published database name in the Vercel project, then redeploy. Public variables are embedded at build time. A local `ws://127.0.0.1:3000` endpoint only works for local browser testing. Keep the SpacetimeDB server and runner running independently of the Vercel web deployment; the runner needs `ADMIN_TOKEN`, which must never be exposed as a `NEXT_PUBLIC_` variable.
