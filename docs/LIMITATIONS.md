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

- **The adaptive AI trader learned to stop losing, not to win.** It picks among four simple strategies using only public information, with starting estimates trained on real crypto price paths (Coinbase 1-minute candles rescaled to HACK ticks) and synthetic sessions. On held-out paths it averaged -56 play dollars per session, against -229 untrained and 0 for simply not trading. In those sessions only the market maker made money on average (+124); even the informed bot, which sees the hidden value, averaged -85 on the real-data paths. Real data shapes only the hidden price path; every trader is still simulated. Full table and earlier versions: `docs/ADAPTIVE_EVAL.md`.

## One-line answer for judges

"Our spoofer was tuned to the Cop's rule, so the table shows they agree, not that the Cop generalises. If the spoofer waits 4 seconds before trading, or 6 seconds before cancelling, the Cop misses it every time. It's a transparent rule-based detector on simulated play-money data, not a production surveillance system."
