'use client';

// Price chart in the classic prediction-market style: thin line, right-hand value axis,
// light grid, a tag on the latest price, time-range tabs and a crosshair on hover or touch.

import { useState } from 'react';

export type PricePoint = { price: number; ts: number };

const W = 640;
const H = 240;
const PR = 58;
const PT = 16;
const PB = 28;

const RANGES = [
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: 'all', label: 'All', ms: Infinity },
] as const;

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export default function PriceChart({ points }: { points: PricePoint[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('all');
  const [hover, setHover] = useState<number | null>(null);

  const newest = points.length ? points[points.length - 1].ts : 0;
  const ms = RANGES.find(r => r.key === range)!.ms;
  const shown = points.filter(p => p.ts >= newest - ms);

  const tabs = (
    <div className="pc-tabs" role="tablist" aria-label="Time range">
      {RANGES.map(r => (
        <button key={r.key} type="button" role="tab" aria-selected={range === r.key} className={range === r.key ? 'on' : undefined} onClick={() => { setRange(r.key); setHover(null); }}>{r.label}</button>
      ))}
    </div>
  );

  if (shown.length < 2) {
    return <div>{tabs}<p className="quiet">Waiting for more trades in this range.</p></div>;
  }

  const prices = shown.map(p => p.price);
  const hi0 = Math.max(...prices);
  const lo0 = Math.min(...prices);
  const pad = hi0 === lo0 ? 2 : Math.max(1, Math.round((hi0 - lo0) * 0.15));
  const hi = hi0 + pad;
  const lo = lo0 - pad;
  const plotW = W - PR;
  const plotH = H - PT - PB;
  const x = (i: number) => (i / (shown.length - 1)) * plotW;
  const y = (p: number) => PT + (1 - (p - lo) / (hi - lo)) * plotH;

  const pts = shown.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const last = shown[shown.length - 1];
  const lx = x(shown.length - 1);
  const ly = y(last.price);
  const ticks = [0, 1, 2, 3].map(i => lo + ((hi - lo) * i) / 3);

  const h = hover !== null && hover < shown.length ? hover : null;
  const hp = h !== null ? shown[h] : null;
  const hx = h !== null ? x(h) : 0;
  const hy = hp ? y(hp.price) : 0;
  // Keep the tooltip inside the plot area.
  const tipW = 118;
  const tipX = Math.min(Math.max(hx - tipW / 2, 0), plotW - tipW);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round((px / plotW) * (shown.length - 1));
    setHover(Math.min(shown.length - 1, Math.max(0, i)));
  }

  return (
    <div>
      {tabs}
      <svg
        className="pchart pchart-live"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Price over ${shown.length} trades, latest ${last.price}`}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--chart)' }} stopOpacity=".24" />
            <stop offset="1" style={{ stopColor: 'var(--chart)' }} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="pc-grid" x1={0} x2={plotW} y1={y(t)} y2={y(t)} />
            <text className="pc-axis" x={plotW + 10} y={y(t) + 4}>{Math.round(t)}</text>
          </g>
        ))}
        <polygon fill="url(#pcFill)" points={`${pts} ${plotW},${PT + plotH} 0,${PT + plotH}`} />
        <polyline className="pc-line" points={pts} />
        <line className="pc-last" x1={0} x2={plotW} y1={ly} y2={ly} />
        <circle className="pc-halo" cx={lx} cy={ly} r={9} />
        <circle className="pc-dot" cx={lx} cy={ly} r={4} />
        <rect className="pc-tag" x={plotW + 4} y={ly - 11} width={PR - 6} height={22} rx={6} />
        <text className="pc-tagtext" x={plotW + 4 + (PR - 6) / 2} y={ly + 4} textAnchor="middle">{last.price}</text>
        <text className="pc-axis" x={0} y={H - 8}>{clock(shown[0].ts)}</text>
        <text className="pc-axis" x={plotW} y={H - 8} textAnchor="end">{clock(last.ts)}</text>
        {hp ? (
          <g pointerEvents="none">
            <line className="pc-cross" x1={hx} x2={hx} y1={PT} y2={PT + plotH} />
            <circle className="pc-hdot" cx={hx} cy={hy} r={4.5} />
            <g transform={`translate(${tipX},${PT})`}>
              <rect className="pc-tip" width={tipW} height={40} rx={8} />
              <text className="pc-tipprice" x={10} y={17}>{hp.price}</text>
              <text className="pc-tiptime" x={10} y={32}>{clock(hp.ts)}</text>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
