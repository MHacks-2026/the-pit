# THE PIT: Spec v1

A live play-money exchange with human traders (phones) and AI bots, plus a Market Cop that detects manipulation and explains it.
This document is the contract between modules. Change it only by announcing in the team chat.

## 1. Exchange rules
- Instruments: (1) HACK, a synthetic index driven by a hidden fundamental value. (2) Optional binary event contracts priced 1 to 99
  that settle to 0 or 100.
- Integer price ticks, integer quantities. Starting cash 10,000 play dollars per account.
- Order types: LIMIT (rests, GTC), IOC (fill what you can, cancel the rest), MARKET (IOC at an extreme price), CANCEL.
- Matching: price-time priority; trades execute at the resting (maker) price; partial fills allowed; two sorted sides with FIFO queues per price.
- Self-trade prevention: if an incoming order would match the same owner, cancel the incoming remainder and emit a
  self_trade_attempt event.
- Risk checks (reject with a reason, never crash): max order size 50, max 20 open orders per account, position limit +/-200,
  cash sufficient for buys, price within +/-20% of the last trade.
- Settlement (event contracts): admin reducer pays 100 per long contract on YES, 0 on NO. HACK PnL is marked to the mid price.
- Determinism: the engine receives a clock and an id counter in a context object. Same input stream gives the same output stream.

## 2. Contract sketch (packages/engine)
```ts
type Side = "buy" | "sell";
type Tif = "GTC" | "IOC";
interface NewOrder { marketId: number; owner: string; side: Side; price: number; qty: number; tif: Tif; }
interface Order extends NewOrder { id: number; remaining: number; status: "open" | "filled" | "cancelled"; ts: number; }
interface Trade { id: number; marketId: number; price: number; qty: number; maker: string; taker: string;
                  makerOrderId: number; takerOrderId: number; ts: number; }
interface Ctx { now: number; nextId: () => number; }
type EngineEvent =
  | { kind: "order_placed"; order: Order } | { kind: "order_cancelled"; orderId: number; owner: string; ts: number }
  | { kind: "trade"; trade: Trade } | { kind: "self_trade_attempt"; owner: string; orderId: number; ts: number }
  | { kind: "rejected"; owner: string; reason: string; ts: number };
interface MatchResult { book: Book; trades: Trade[]; events: EngineEvent[]; }
declare function matchOrder(book: Book, incoming: NewOrder, ctx: Ctx): MatchResult;
declare function cancelOrder(book: Book, orderId: number, owner: string, ctx: Ctx): MatchResult;
interface Alert { id: number; owner: string; kind: "spoofing" | "quote_stuffing" | "wash"; score: number; evidence: unknown;
                  narration?: string; ts: number; }
```

## 3. Spacetime tables
| Table | Key fields | Notes |
|---|---|---|
| account | identity (PK), name, cash, is_bot, created_at | public; humans via join(name) |
| market | id (PK), symbol, kind, tick, status | status open / settled |
| order | id (PK), market_id, owner, side, price, qty, remaining, status, ts | client builds the book from open rows |
| trade | id (PK), market_id, price, qty, maker, taker, ts | the tape |
| position | (owner, market_id), qty, avg_price | updated in the same transaction as trades |
| event_log | id (PK), kind, owner, market_id, payload, ts | Cop input |
| alert | id (PK), owner, kind, score, evidence, narration, ts | written via admin_raise_alert |
| news | id (PK), market_id, text, ts | delayed, noisy hints about the hidden fundamental |

Reducers: join, place_order, cancel_order, cancel_all, admin_settle, admin_reset_market, admin_register_bot,
admin_raise_alert, admin_post_news. Reducers run transactionally: order -> trades -> positions -> event_log is atomic.
Admin reducers check the caller against a stored admin identity.

## 4. Bots (apps/runner, normal clients)
- World simulator: hidden fundamental v(t), random walk with jumps. Publishes delayed, noisy news rows.
- Market Maker: Avellaneda-Stoikov. Reservation price r = s - q*gamma*sigma^2*(T-t). Half-spread from gamma*sigma^2*(T-t) + (2/gamma)*ln(1+gamma/k).
  Defaults gamma=0.1, k=1.5, refresh every 1 s, inventory cap.
- Noise trader: Poisson arrivals, random side, small marketable or near-touch orders.
- Informed trader: trades toward v(t) when |v - mid| exceeds a threshold.
- Spoofer (adversary): places layered large orders on side S, trades the opposite side, cancels the layers within seconds.
- LLM persona (P2): reads news every ~20 s and trades.

## 5. Market Cop (packages/cop, pure)
- Rolling 30 s window per account from event_log.
- Spoofing/layering: (a) >= 3 resting orders at >= 2 distinct price levels on one side totaling >= 3x the account's median order size;
  (b) a trade by the same account on the opposite side within 3 s after placing them; (c) >= 80% of the layered quantity cancelled within 5 s of that trade.
- Quote stuffing (P2): >= 15 orders in 10 s, cancel-to-order ratio >= 0.9, fill ratio near 0.
- Wash/self-trade (P2): >= 2 self_trade_attempt events in 30 s.
- Score 0 to 100; alert at >= 70. Alerts carry a structured evidence JSON (order ids, times, quantities).
- phantomScore(order, accountStats) in [0,1] for the 3D X-ray: distance from touch, size vs median, account cancel rate, age.
- Evaluation: N simulated sessions with and without the Spoofer. The Market Maker must NOT be flagged. Report precision and recall.

## 6. Narrator (apps/web)
POST /api/narrate: compact JSON (last trades, spread, imbalance, optional alert) -> text (<= 25 words) and optional ElevenLabs audio.
LLM may use ONLY facts in the JSON. Server rate limit 1 call / 6 s, only on interesting events, cache by event hash,
NARRATOR_ENABLED kill switch. Fallbacks: ElevenLabs -> browser speechSynthesis -> text only.

## 7. Client views
- /join: name entry, starting cash, QR for this URL. /trade: phone UI (buy/sell, price/qty, positions, open orders, cancel, Beat-the-Cop challenge).
- /screen: Big Screen (order book depth, tape, price chart, leaderboard, alert feed, narrator, 3D X-ray if built). Admin reset-market button.

## 8. Demo beats (2 minutes)
1. Hook + QR. 2. Living market (bots trading, narrator talking). 3. A judge trades. 4. Beat the Cop: judge layers orders, walls glow and collapse,
the Cop speaks the explanation, a citation card appears on their phone. 5. Evaluation table. 6. Close: "Markets are only fair if someone is watching."

## 9. Non-goals
Real money, real brokerage data, user passwords, market creation UI, native mobile app, any claim of investment advice. Play money only, shown on screen.
