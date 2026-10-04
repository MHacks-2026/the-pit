// Price chart: recent trades as a line, with a price scale and a tag on the latest price.

const W = 640;
const H = 230;
const PR = 58; // room on the right for the price scale
const PT = 16;
const PB = 26;

export default function PriceChart({ prices }: { prices: number[] }) {
  if (prices.length < 2) return <p className="board-sub">Waiting for trades to draw the chart.</p>;

  const hi0 = Math.max(...prices);
  const lo0 = Math.min(...prices);
  const pad = hi0 === lo0 ? 2 : Math.max(1, Math.round((hi0 - lo0) * 0.15));
  const hi = hi0 + pad;
  const lo = lo0 - pad;
  const plotW = W - PR;
  const plotH = H - PT - PB;
  const x = (i: number) => (i / (prices.length - 1)) * plotW;
  const y = (p: number) => PT + (1 - (p - lo) / (hi - lo)) * plotH;

  const pts = prices.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const last = prices[prices.length - 1];
  const lx = x(prices.length - 1);
  const ly = y(last);
  const ticks = [0, 1, 2, 3].map(i => lo + ((hi - lo) * i) / 3);

  return (
    <svg className="pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price of the last ${prices.length} trades, latest ${last}`}>
      <defs>
        <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#54d7c8" stopOpacity=".3" />
          <stop offset="1" stopColor="#54d7c8" stopOpacity="0" />
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
      <text className="pc-tagtext" x={plotW + 4 + (PR - 6) / 2} y={ly + 4} textAnchor="middle">{last}</text>
      <text className="pc-axis" x={0} y={H - 6}>older</text>
      <text className="pc-axis" x={plotW} y={H - 6} textAnchor="end">latest</text>
    </svg>
  );
}
