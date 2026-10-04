# Limitations (paste into the README)

## What the evaluation does and does not show

- **Everything is simulated.** The traders are our own bots (market maker, noise, informed, spoofer) on play money. No real market data, no real manipulators, no human-labelled cases.
- **The spoofer was built against the Cop's rule.** Its default timing (trade 1 s after layering, cancel 1 s after the trade) sits inside the Cop's windows on purpose. So the 100% recall in the evaluation table shows that the detector and our spoofer agree. It does not show that the Cop catches manipulators it was not designed around.
- **The detector is a fixed rule, and it is easy to evade.** It flags an account that layers 3 or more orders on one side, trades the other side within 3 s, then cancels at least 80% of the layered size within 5 s. Changing either timing is enough to avoid it:

| Spoofer variant (50 seeds x 60 s) | Sessions flagged | Alerts on other accounts |
|---|---|---|
| Default: trade 1 s after layering, cancel 1 s after trading | 50/50 | 0 |
| Trade 3 s after layering | 47/50 | 0 |
| Trade 4 s after layering | **0/50** | 0 |
| Cancel 5 s after trading | 49/50 | 0 |
| Cancel 6 s after trading | **0/50** | 0 |

  The evasive spoofers still trade every cycle (more than 180 trades in each 50-seed run); the Cop simply does not see them. Reproduce with `runStream({ seed, spoofer: true, spooferParams: { layerDelayMs: 4000 } })` from `@the-pit/bots`; `packages/bots/src/copStreams.test.ts` checks both evasive cases.
- **No false alarms means: none on our bots.** The negative controls are our own market maker (including a 250 ms re-quoting variant) and noise and informed traders. Real market makers and human traders behave differently and were not tested.
- **The narrator uses a fixed template.** We run without an LLM key, so each alert is narrated by a template filled only from the alert's evidence (e.g. "4 buy orders layered, then a sell trade, then 80 of 80 units cancelled"). The code can call an LLM, with a check that rejects any sentence containing a number not in the evidence, but that path is off in the demo.

- **The adaptive AI trader learned to stop losing, not to win.** It picks among five simple strategies using only public information (the book, recent prices and the public news hint), with starting estimates trained on real crypto price paths (30 days of Coinbase 1-minute candles rescaled to HACK ticks) and synthetic sessions. On 172 held-out paths it averaged -30 play dollars per session, against -202 untrained and 0 for simply not trading. In those sessions only the market maker made money on average (+118); even the informed bot, which sees the hidden value, averaged -122. Full table and earlier versions: `docs/ADAPTIVE_EVAL.md`.
- **Public news has almost no edge.** The news hint is released 5 s late with +/-5 ticks of noise, and the informed bot already trades on the hidden value live, so the price has usually moved before the hint is public. Trading on news alone averaged -2; adding the news strategy moved the AI from -39 to -30, a difference within run-to-run noise.

- **The real-market panel shows signals, not suspects.** `/screen` streams Bitstamp's public BTC/USD order feed (Coinbase's equivalent feed now requires authentication) through the Cop's `marketWatch`: order, cancel and trade rates, the share cancelled without trading, and "flash orders" (at least 3x the median size, within 50 bp of the last trade, gone within 5 s, never filled). Public feeds carry order ids but no account ids, so the spoofing rule itself cannot run there, and most flash orders are ordinary market makers re-quoting. In a 60 s sample (2026-10-04): 87 orders/s, 99.75% cancelled without trading, 0.2 trades/s.

- **On real-data markets the results hold, including the limits.** On 171 held-out real price paths with every bot trading, the Cop caught the default spoofer in 171/171 sessions with 0 false alarms (market maker and adaptive AI included), and missed both evasive variants in 171/171. In those sessions the spoofer still made money on average (+67) and the adaptive AI lost most when it was present, so catching spoofing matters even when it is detected after the fact. See `docs/REAL_DATA_EVAL.md`.

- **The market record is tamper-evident, not tamper-proof.** Every event_log row (and every market reset) is chained to the previous one with SHA-256 in the same transaction, in public `event_chain` / `chain_head` tables, and `apps/runner/src/audit-cli.ts` recomputes every link. Tested: editing or deleting a past event by hand is reported precisely. The database owner could still rewrite every hash consistently; the protection is that the latest head is shown live on the Big Screen, so a later rewrite would not match what people already saw. Publishing heads somewhere independent is the next step. Events written before the upgrade are not covered (the audit counts them).

## One-line answer for judges

"Our spoofer was tuned to the Cop's rule, so the table shows they agree, not that the Cop generalises. If the spoofer waits 4 seconds before trading, or 6 seconds before cancelling, the Cop misses it every time. It's a transparent rule-based detector on simulated play-money data, not a production surveillance system."
