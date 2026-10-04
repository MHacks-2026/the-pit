'use client';

// "Try to cheat" (T23): spoofing in three steps, the same pattern the Market Cop looks for.
//   1. place a wall of big fake sell orders just behind the best ask (layering)
//   2. buy a small amount at the best ask (a trade on the opposite side)
//   3. pull the whole wall (cancel everything)
// Mirrors layeringMacro in packages/bots/src/spoofer.ts (same defaults), kept local so web needs no new dependency.

import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '@the-pit/bindings';
import { HACK_MARKET_ID } from '../../lib/live';

const LAYERS = 4;
const LAYER_QTY = 20;
const TRADE_QTY = 2;
const PAUSE_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CheatButton({ lastPrice, bestAsk }: { lastPrice: number | null; bestAsk: number | null }) {
  const placeOrder = useReducer(reducers.placeOrder);
  const cancelAll = useReducer(reducers.cancelAll);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    let failed = false;
    const touch = bestAsk ?? (lastPrice ?? 100) + 1;
    try {
      await cancelAll(); // start clean: our own old orders would otherwise block the trade as a self-trade
      setStatus('Step 1 of 3: building a fake wall of sell orders…');
      for (let i = 0; i < LAYERS; i++) {
        await placeOrder({ marketId: HACK_MARKET_ID, side: 'sell', price: touch + 1 + i, qty: LAYER_QTY, tif: 'GTC' });
      }
      await sleep(PAUSE_MS);
      setStatus('Step 2 of 3: buying on the other side…');
      await placeOrder({ marketId: HACK_MARKET_ID, side: 'buy', price: touch, qty: TRADE_QTY, tif: 'IOC' });
      await sleep(PAUSE_MS);
      setStatus('Step 3 of 3: pulling the wall…');
    } catch (err) {
      failed = true;
      setError(err instanceof Error ? err.message : 'The cheat failed');
    }
    // Always clean up, even if a step failed, so no fake orders are left in the book.
    try {
      await cancelAll();
      setStatus(failed ? null : 'Done. Check the Big Screen. Did the Market Cop catch you?');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t pull the wall');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="cheat-box">
      <h3 className="trade-orders-title">Try to cheat</h3>
      <p className="join-hint">
        Fake a wall of sell orders, trade the other way, then pull the wall. This is spoofing. Can you beat the Market Cop?
      </p>
      <button className="cheat-button" type="button" disabled={running} onClick={run}>
        {running ? 'Cheating…' : 'Try to cheat'}
      </button>
      {status ? <p className="join-status" role="status">{status}</p> : null}
      {error ? <p className="join-error" role="alert">{error}</p> : null}
    </div>
  );
}
