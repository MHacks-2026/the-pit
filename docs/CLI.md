# Local SpacetimeDB smoke commands

Install the SpacetimeDB CLI and run `pnpm install` first. Start `spacetime start` in a separate terminal, then from the repository root:

```sh
spacetime publish the-pit-local --module-path spacetimedb/spacetimedb --server local --yes
spacetime generate --lang typescript --out-dir packages/bindings/src --module-path spacetimedb/spacetimedb --yes
spacetime call the-pit-local join '"Ada"' --server local --anonymous --yes
spacetime sql the-pit-local 'SELECT * FROM account' --server local --anonymous --yes
```

`join` uses the caller identity. Admin calls require the identity that published the database. Set `ADMIN_TOKEN` for the runner to that publisher's token. Register each bot identity from that identity; a bot's own connection credentials must remain outside Git.

```sh
spacetime call the-pit-local place_order 1 '"buy"' 100 2 '"GTC"' --server local --yes
spacetime call the-pit-local cancel_order 1 --server local --yes
spacetime call the-pit-local cancel_all --server local --yes
spacetime call the-pit-local admin_register_bot '"<bot-identity-hex>"' '"MM-1"' --server local --yes
spacetime call the-pit-local admin_post_news 1 '"A delayed market hint"' --server local --yes
spacetime call the-pit-local admin_raise_alert '"<owner-identity-hex>"' '"spoofing"' 80 '"{}"' 'null' --server local --yes
spacetime call the-pit-local admin_settle 1 true --server local --yes
spacetime call the-pit-local admin_reset_market 1 --server local --yes
```

`place_order`, `cancel_order`, and `cancel_all` are live as of T09. A market IOC uses price `2147483647` for buys or `0` for sells. `admin_raise_alert` is live as of T21; the runner supplies a JSON evidence string. `admin_settle` and `admin_reset_market` remain stubs until their later tickets.

On Windows, `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-integration.ps1` runs all three live acceptance tests against a uniquely named, in-memory localhost database. The script needs the SpacetimeDB CLI installed and free port 3000, but no personal CLI login. It gets a token from that localhost server, uses an isolated temporary CLI profile, starts a temporary runner, and removes test credentials when finished. Test logs stay under gitignored `.tools/`. It never publishes to Maincloud.

The same script runs a read-only exchange audit after the Cop test. To audit an already running database without changing it, set `NEXT_PUBLIC_SPACETIME_URI` and `NEXT_PUBLIC_SPACETIME_DB`, then run `corepack pnpm --filter runner exec tsx src/audit-cli.ts`. The audit compares cash and positions with trade replay, order quantities with fills, and alert evidence with recorded orders and trades. It assumes the current HACK-only market with 10,000 starting cash per account; revisit that assumption before adding settlement or market reset.

Add `-Load` to the Windows integration command to connect 20 temporary clients alongside the five bots, place 200 one-unit IOC orders, report reducer p50/p95/max latency and table growth, then rerun the read-only audit. The load command refuses any database except a `pit-it-*` database on localhost.

`.github/workflows/backend.yml` runs unit tests, the full build, and this disposable database acceptance path on pushes to `main` and pull requests. It downloads the pinned SpacetimeDB 2.10.2 Windows binaries with a SHA-256 check and uses a localhost-issued admin token, so no GitHub secret or Maincloud access is needed. The first hosted run passed. GitHub currently returns `403` for both branch protection and rulesets on this private repository, stating that GitHub Pro or a public repository is required. Until that plan limitation changes, review the `Backend checks / verify` result before merging; GitHub cannot require it automatically here.
