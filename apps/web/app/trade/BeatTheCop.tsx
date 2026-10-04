'use client';

// Beat the Cop (T35): a 60 second challenge.
// Score = profit during the 60 seconds minus COP_PENALTY for every Market Cop alert raised against you.
// Cheat as much as you like (Try to cheat, above), but every alert costs you.

import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';
import { COP_PENALTY } from '../../lib/copScore';
import CheatButton from './CheatButton';

const CHALLENGE_SECONDS = 60;

type Run = { startNet: number; startAlerts: number; endsAt: number };
type Result = { profit: number; caught: number; score: number };

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('en-US')}`;
}

export default function BeatTheCop({ myHex, cash, position, mid, lastPrice, bestAsk }: { myHex: string; cash: number; position: number; mid: number; lastPrice: number | null; bestAsk: number | null }) {
  const [alerts] = useTable(tables.alert);
  const myAlerts = alerts.filter(a => a.owner.toHexString() === myHex).length;
  const net = cash + position * mid;

  const [run, setRun] = useState<Run | null>(null);
  const [left, setLeft] = useState(CHALLENGE_SECONDS);
  const [result, setResult] = useState<Result | null>(null);

  // The timer reads the newest numbers from here when time runs out.
  const latest = useRef({ net, myAlerts });
  useEffect(() => {
    latest.current = { net, myAlerts };
  });

  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        const profit = Math.round(latest.current.net - run.startNet);
        const caught = latest.current.myAlerts - run.startAlerts;
        setResult({ profit, caught, score: profit - COP_PENALTY * caught });
        setRun(null);
      }
    }, 250);
    return () => clearInterval(id);
  }, [run]);

  function start() {
    setResult(null);
    setLeft(CHALLENGE_SECONDS);
    setRun({ startNet: net, startAlerts: myAlerts, endsAt: Date.now() + CHALLENGE_SECONDS * 1000 });
  }

  const live = run
    ? (() => {
        const profit = Math.round(net - run.startNet);
        const caught = myAlerts - run.startAlerts;
        return { profit, caught, score: profit - COP_PENALTY * caught };
      })()
    : null;

  return (
    <div className="cop-box">
      <h3 className="trade-orders-title">Beat the Cop</h3>
      <p className="join-hint">
        You have {CHALLENGE_SECONDS} seconds. Make money any way you like, even by cheating, but every Market Cop alert against you costs {COP_PENALTY} points.
      </p>
      <button className="cop-button" type="button" disabled={run !== null} onClick={start}>
        {run ? `${left}s left` : result ? 'Play again' : 'Start the challenge'}
      </button>

      <CheatButton lastPrice={lastPrice} bestAsk={bestAsk} enabled={run !== null} />

      {live ? (
        <dl className="cop-stats" aria-live="polite">
          <div><dt>Profit</dt><dd>{signed(live.profit)}</dd></div>
          <div><dt>Caught</dt><dd>{live.caught}×</dd></div>
          <div><dt>Score</dt><dd>{signed(live.score)}</dd></div>
        </dl>
      ) : null}

      {result ? (
        <p className="join-status" role="status">
          Final score {signed(result.score)}. {result.caught === 0 ? 'The Cop never caught you.' : `The Cop caught you ${result.caught} time${result.caught === 1 ? '' : 's'}.`}
        </p>
      ) : null}
    </div>
  );
}
