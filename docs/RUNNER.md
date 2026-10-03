# Runner setup

Publish the SpacetimeDB module with an authenticated owner identity, then generate bindings (see [CLI.md](CLI.md)). Set `NEXT_PUBLIC_SPACETIME_URI` and `NEXT_PUBLIC_SPACETIME_DB` to that server and database. Set `ADMIN_TOKEN` to the publisher's token. Keep real values in your local environment or secret manager, never in Git.

Run `pnpm --filter runner start`. The runner connects one market maker, `PIT_BOT_COUNT` noise traders, and one informed trader as separate clients. It calls `admin_register_bot` from the admin connection, renews market maker quotes each second, generates Poisson noise orders, moves a hidden fundamental, and posts delayed news. `PIT_SEED` fixes the bot strategy random stream. The token file at `PIT_RUNNER_TOKEN_FILE` is gitignored and preserves each bot identity across restarts.

For a local integration test, use a disposable local database and set `PIT_TEST_DATABASE` plus `ADMIN_TOKEN`, then run `pnpm test`. The test connects a distinct bot identity, registers it, places an order, and posts news.
