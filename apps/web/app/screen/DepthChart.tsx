// Depth chart (T14): how much is wanted or for sale at each price, added up.
// Green steps on the left are buyers, red steps on the right are sellers.
// The gap in the middle is the spread. A tall side is a wall: it takes a lot to push the price through it.

type Level = { price: number; qty: number };

const W = 640;
const H = 210;
const PT = 22;
const PB = 26;

function stairs(levels: Level[], x: (p: number) => number, y: (q: number) => number, edge: number): string {
  if (levels.length === 0) return '';
  const pts: string[] = [`${x(levels[0].price).toFixed(1)},${y(0).toFixed(1)}`];
  let cum = 0;
  levels.forEach((level, i) => {
    cum += level.qty;
    pts.push(`${x(level.price).toFixed(1)},${y(cum).toFixed(1)}`);
    const nextX = i + 1 < levels.length ? x(levels[i + 1].price) : edge;
    pts.push(`${nextX.toFixed(1)},${y(cum).toFixed(1)}`);
  });
  pts.push(`${edge.toFixed(1)},${y(0).toFixed(1)}`);
  return pts.join(' ');
}

export default function DepthChart({ bids, asks }: { bids: Level[]; asks: Level[] }) {
  if (bids.length === 0 && asks.length === 0) {
    return <p className="board-sub">No resting orders yet.</p>;
  }
  const prices = [...bids, ...asks].map(l => l.price);
  let lo = Math.min(...prices) - 1;
  let hi = Math.max(...prices) + 1;
  const bestBid = bids.length ? bids[0].price : null;
  const bestAsk = asks.length ? asks[0].price : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  if (mid !== null) {
    const half = Math.max(mid - lo, hi - mid);
    lo = mid - half;
    hi = mid + half;
  }
  const total = (levels: Level[]) => levels.reduce((sum, l) => sum + l.qty, 0);
  const maxCum = Math.max(1, total(bids), total(asks));
  const x = (p: number) => ((p - lo) / (hi - lo)) * W;
  const y = (q: number) => H - PB - (q / maxCum) * (H - PB - PT);

  return (
    <svg className="dchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Depth chart: total buy and sell size at each price">
      <defs>
        <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#30d158" stopOpacity=".42" />
          <stop offset="1" stopColor="#30d158" stopOpacity=".03" />
        </linearGradient>
        <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff453a" stopOpacity=".42" />
          <stop offset="1" stopColor="#ff453a" stopOpacity=".03" />
        </linearGradient>
      </defs>
      <line className="pc-grid" x1={0} x2={W} y1={y(0)} y2={y(0)} />
      <polygon className="dc-bid" points={stairs(bids, x, y, 0)} />
      <polygon className="dc-ask" points={stairs(asks, x, y, W)} />
      {mid !== null ? (
        <g>
          <line className="dc-mid" x1={x(mid)} x2={x(mid)} y1={PT - 6} y2={y(0)} />
          <text className="pc-axis" x={x(mid)} y={H - 6} textAnchor="middle">{mid}</text>
        </g>
      ) : null}
      <text className="pc-axis" x={0} y={H - 6}>{Math.round(lo)}</text>
      <text className="pc-axis" x={W} y={H - 6} textAnchor="end">{Math.round(hi)}</text>
      <text className="pc-axis" x={0} y={12}>{maxCum} units</text>
    </svg>
  );
}
