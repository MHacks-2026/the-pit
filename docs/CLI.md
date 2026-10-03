# Local SpacetimeDB smoke commands

Install the SpacetimeDB CLI and run `pnpm install` first. Start `spacetime start` in a separate terminal, then from the repository root:

```sh
spacetime publish the-pit-local --module-path spacetimedb/spacetimedb --server local --anonymous --yes
spacetime generate --lang typescript --out-dir packages/bindings/src --module-path spacetimedb/spacetimedb --yes
spacetime call the-pit-local join '"Ada"' --server local --anonymous --yes
spacetime sql the-pit-local 'SELECT * FROM account' --server local --anonymous --yes
```

`join` uses the caller identity. Admin calls require the identity that published the database. Register each bot identity from that identity; a bot's own connection credentials must remain outside Git.

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

At T05, `place_order`, `cancel_order`, `cancel_all`, `admin_raise_alert`, `admin_settle`, and `admin_reset_market` are deliberate stubs that return a reason. T09 and T21 implement their live paths.
