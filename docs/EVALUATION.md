# Market Cop evaluation (T29)

Method: 50 seeds x 60 s per condition. Each session is simulated with the real matching engine and bots (packages/bots/src/streamSim.ts). Its event_log rows are then replayed through the rule-based Cop (packages/cop). Reproduce with: `pnpm exec vitest run packages/bots/src/evaluation.test.ts`

| Condition | Runs | Spoofer caught | Alerts on spoofer | Alerts on other accounts | Runs with a false alarm |
|---|---|---|---|---|---|
| MM + noise + informed | 50 | n/a | 0 | 0 | 0 |
| Fast-requote MM (250 ms) | 50 | n/a | 0 | 0 | 0 |
| With spoofer | 50 | 50/50 | 138 | 0 | 0 |
| With spoofer + fast MM | 50 | 50/50 | 140 | 0 | 0 |

Recall: 100.0% (100/100 spoofer sessions flagged). Precision: 100.0% (278/278 alerts named the spoofer).

The Market Maker is the negative control. It makes real fills and cancels often, and is never flagged.

Limitations: the manipulator is simulated and its parameters were designed against the same rule the Cop implements, so these numbers are an upper bound that checks the implementation, not real-world detection. Sessions are 60 s long. Play money only.

Real-data check: the same Cop on 171 held-out real crypto price paths (all bots, including the trained adaptive AI) caught the spoofer in 171/171 sessions with 0 false alarms; the evasive variants still get through (0/171). Details and a bot leaderboard: [REAL_DATA_EVAL.md](REAL_DATA_EVAL.md).
