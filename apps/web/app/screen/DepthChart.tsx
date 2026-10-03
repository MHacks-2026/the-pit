// Depth chart (T14): how much is for sale or wanted at each price, added up.
// Green steps on the left are buyers, red steps on the right are sellers.
// The taller a side gets, the more it would take to push the price that way.

type Level = { price: number; qty: number };

const W = 600;
const H = 180;
const PAD = 10;

// Steps for one side. `levels` must start at the touch and move away from it.
function stairs(levels: Level[], x: (p: number) => number, y: (q: number) => number, edge: number): string {
  if (levels.length === 0) return '';
  const pts: string[] = [`${x(levels[0].price)},${y(0)}`];
  let cum = 0;
  levels.forEach((level, i) => {
    cum += level.qty;
    pts.push(`${x(level.price)},${y(cum)}`);
    const nextX = i + 1 < levels.length ? x(levels[i + 1].price) : edge;
    pts.push(`${nextX},${y(cum)}`);
  });
  pts.push(`${edge},${y(0)}`);
  return pts.join(' ');
}

export default function DepthChart({ bids, asks }: { bids: Level[]; asks: Level[] }) {
  if (bids.length === 0 && asks.length === 0) {
    return <p className="board-sub">No resting orders yet.</p>;
  }
  const prices = [...bids, ...asks].map(l => l.price);
  const lo = Math.min(...prices) - 1;
  const hi = Math.max(...prices) + 1;
  const total = (levels: Level[]) => levels.reduce((sum, l) => sum + l.qty, 0);
  const maxCum = Math.max(1, total(bids), total(asks));
  const x = (p: number) => Number((PAD + ((p - lo) / (hi - lo)) * (W - 2 * PAD)).toFixed(1));
  const y = (q: number) => Number((H - PAD - (q / maxCum) * (H - 2 * PAD)).toFixed(1));

  return (
    <>
      <svg className="board-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Depth chart: cumulative buy and sell quantity by price">
        <polygon className="depth-bid" points={stairs(bids, x, y, x(lo))} />
        <polygon className="depth-ask" points={stairs(asks, x, y, x(hi))} />
      </svg>
      <p className="depth-axis"><span>{lo + 1}</span><span>price</span><span>{hi - 1}</span></p>
    </>
  );
}
