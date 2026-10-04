'use client';

// The depth X-ray: the last ~30 seconds of the live order book drawn as a 3D ridge landscape on a canvas, one ridge
// every 400 ms, newest in front. Depth is height, price runs left to right, time runs into the screen. Nothing is
// highlighted until the Cop names orders in an alert; then the depth those orders made is hazard-striped back
// through the history, and the opposite-side trade gets a diamond. Drag or use the arrow keys to turn it.

import { useEffect, useRef, useState } from 'react';
import {
  centerPrice, copFlags, maxDepth, pushRow, rowCells, sampleRow, XRAY_HALF_WIDTH, XRAY_ROWS, XRAY_SAMPLE_MS,
  type XrayOrder, type XrayRow, type XrayTrade,
} from '../../lib/xray';

const DEFAULT_VIEW = { yaw: -0.24, pitch: 0.42 };
const YAW_LIMIT = 0.95;
const PITCH_MIN = 0.22;
const PITCH_MAX = 0.98;
const DEPTH = 0.8; // world depth of the whole history; price runs -1..1
const HEIGHT = 0.45; // world height of the deepest level

type Palette = Record<'paper' | 'panel' | 'ink' | 'rule' | 'muted' | 'up' | 'down' | 'cop' | 'onCop' | 'sans', string>;

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    paper: v('--paper', '#d9c28a'), panel: v('--panel', '#efe3bf'), ink: v('--ink', '#1a1712'),
    rule: v('--rule', '#a8925b'), muted: v('--muted', '#5e5334'), up: v('--up', '#1f5a33'),
    down: v('--down', '#9a2a1b'), cop: v('--cop', '#f2c230'), onCop: v('--on-cop', '#1a1712'),
    sans: v('--sans', 'Arial Narrow, sans-serif'),
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface Props {
  orders: readonly XrayOrder[];
  trades: readonly XrayTrade[];
  evidence: readonly string[];
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
}

export default function DepthXray({ orders, trades, evidence, bestBid, bestAsk, lastPrice }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ orders, trades });
  latest.current = { orders, trades };
  const seenTrades = useRef<Set<string> | null>(null);
  // Last open size of every order seen, so a wall the spoofer has already cancelled can still be measured.
  const orderQty = useRef(new Map<string, number>());
  const [rows, setRows] = useState<XrayRow[]>([]);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const center = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  // Sample the book on a fixed beat.
  useEffect(() => {
    const tick = () => {
      const { orders: book, trades: tape } = latest.current;
      if (!seenTrades.current) seenTrades.current = new Set(tape.map(t => t.id)); // ignore history before mount
      const fresh = tape.filter(t => !seenTrades.current!.has(t.id));
      for (const t of fresh) seenTrades.current.add(t.id);
      for (const o of book) if (o.remaining > 0) orderQty.current.set(o.id, o.remaining);
      setRows(prev => pushRow(prev, sampleRow(book, fresh)));
    };
    tick();
    const timer = setInterval(tick, XRAY_SAMPLE_MS);
    return () => clearInterval(timer);
  }, []);

  // Colours come from the theme; re-read them when the scheme changes.
  useEffect(() => {
    const refresh = () => setPalette(readPalette());
    refresh();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => { media.removeEventListener('change', refresh); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      setSize({ w, h: Math.round(clamp(w * 0.4, 170, 440)) });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // The price axis only re-centres when the mid wanders off the middle third, so the landscape doesn't jitter.
  const target = centerPrice(bestBid, bestAsk, lastPrice);
  if (center.current === null || Math.abs(target - center.current) > XRAY_HALF_WIDTH / 3) center.current = target;
  const mid = center.current;
  const flags = copFlags(evidence);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    draw(ctx, size.w, size.h, rows, mid, flags, orderQty.current, view, palette);
  });

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ...view };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    setView({
      yaw: clamp(d.yaw + (e.clientX - d.x) * 0.006, -YAW_LIMIT, YAW_LIMIT),
      pitch: clamp(d.pitch + (e.clientY - d.y) * 0.005, PITCH_MIN, PITCH_MAX),
    });
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = { ArrowLeft: [-0.08, 0], ArrowRight: [0.08, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (!step) return;
    e.preventDefault();
    setView(v => ({ yaw: clamp(v.yaw + step[0], -YAW_LIMIT, YAW_LIMIT), pitch: clamp(v.pitch + step[1], PITCH_MIN, PITCH_MAX) }));
  }

  const flaggedCount = flags.orderIds.size;
  const turned = view.yaw !== DEFAULT_VIEW.yaw || view.pitch !== DEFAULT_VIEW.pitch;

  return (
    <section className="xray" aria-label="Order book X-ray">
      <div className="xray-head">
        <h3>Order book X-ray</h3>
        <p className="quiet">The last 30 seconds of resting orders, newest in front. Drag or use the arrow keys to turn it.</p>
        <button type="button" className="xray-reset" onClick={() => setView(DEFAULT_VIEW)} disabled={!turned}>Reset view</button>
      </div>
      <div ref={wrapRef} className="xray-stage">
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          tabIndex={0}
          role="img"
          aria-label={`Order depth by price over the last 30 seconds, centred on ${mid}. ${flaggedCount > 0
            ? `${flaggedCount} orders named by the Cop are striped.` : 'No orders named by the Cop.'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul className="xray-legend">
        <li><i className="xk-bid" />Bids</li>
        <li><i className="xk-ask" />Asks</li>
        <li><i className="xk-cop" />Orders the Cop flagged</li>
        <li><i className="xk-trade" />Opposite trade</li>
      </ul>
    </section>
  );
}

interface View { yaw: number; pitch: number }

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, rows: readonly XrayRow[], mid: number,
  flags: { orderIds: Set<string>; tradeIds: Set<string> }, orderQty: ReadonlyMap<string, number>, view: View, c: Palette) {
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  // Orthographic: rotate about the vertical axis, then tilt toward the viewer. Far rows sit higher on screen.
  const raw = (x: number, y: number, z: number) => {
    const xr = x * cy - z * sy;
    const zr = x * sy + z * cy;
    return { x: xr, y: -y * cp - zr * sp, depth: zr };
  };
  // Fit the bounding box of the scene into the canvas, leaving room for labels.
  const corners = [-1, 1].flatMap(x => [0, DEPTH].flatMap(z => [0, HEIGHT].map(y => raw(x, y, z))));
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
  const narrow = w < 600;
  const pad = { l: narrow ? 52 : 64, r: narrow ? 8 : 24, t: 34, b: 30 };
  const scale = Math.min((w - pad.l - pad.r) / (maxX - minX), (h - pad.t - pad.b) / (maxY - minY));
  const ox = pad.l + ((w - pad.l - pad.r) - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = pad.t + ((h - pad.t - pad.b) - (maxY - minY) * scale) / 2 - minY * scale;
  const P = (x: number, y: number, z: number) => { const p = raw(x, y, z); return { x: ox + p.x * scale, y: oy + p.y * scale }; };

  const half = XRAY_HALF_WIDTH;
  const xOf = (price: number) => (price - mid) / half;
  const zOf = (i: number) => (i / (XRAY_ROWS - 1)) * DEPTH;
  const top = maxDepth(rows, mid);
  const yOf = (qty: number) => (qty / top) * HEIGHT;

  ctx.lineJoin = 'round';
  ctx.font = `600 12px ${c.sans}`;

  // Floor: outline and a few time rules.
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1;
  for (const i of [0, 25, 50, XRAY_ROWS - 1]) {
    const a = P(-1, 0, zOf(i)), b = P(1, 0, zOf(i));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const x of [-1, 0, 1]) {
    const a = P(x, 0, 0), b = P(x, 0, DEPTH);
    ctx.setLineDash(x === 0 ? [3, 5] : []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]);

  const hazard = hazardPattern(ctx, c);
  // Back to front so nearer ridges cover the ones behind them.
  const order = rows.map((_, i) => i).sort((a, b) => raw(0, 0, zOf(b)).depth - raw(0, 0, zOf(a)).depth);
  let wall: { at: { x: number; y: number }; qty: number } | null = null;
  const marks: { x: number; y: number }[] = [];

  for (const i of order) {
    const row = rows[i];
    const z = zOf(i);
    const cells = rowCells(row, mid, flags.orderIds, orderQty, half);
    const fade = 1 - (i / XRAY_ROWS) * 0.55;

    // Silhouette in the panel colour hides what is behind it.
    ctx.beginPath();
    const start = P(-1, 0, z);
    ctx.moveTo(start.x, start.y);
    for (const cell of cells) {
      const p = P(xOf(cell.price), yOf(cell.bid + cell.ask), z);
      ctx.lineTo(p.x, p.y);
    }
    const end = P(1, 0, z);
    ctx.lineTo(end.x, end.y);
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = c.panel;
    ctx.fill();

    // Flagged depth: a striped column at each level the Cop's named orders occupied.
    ctx.globalAlpha = 1;
    let rowFlagged = 0;
    for (const cell of cells) {
      if (cell.flagged <= 0) continue;
      rowFlagged += cell.flagged;
      const x0 = xOf(cell.price - 0.45), x1 = xOf(cell.price + 0.45), y1 = yOf(cell.flagged);
      const q = [P(x0, 0, z), P(x0, y1, z), P(x1, y1, z), P(x1, 0, z)];
      ctx.beginPath();
      q.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      if (hazard) ctx.fillStyle = hazard;
      else ctx.fillStyle = c.cop;
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (rowFlagged > 0 && (!wall || rowFlagged >= wall.qty)) { // the biggest the wall got; newer rows win ties
      const peak = cells.reduce((best, cell) => (cell.flagged > best.flagged ? cell : best));
      wall = { at: P(xOf(peak.price), yOf(peak.bid + peak.ask), z), qty: rowFlagged };
    }

    // Ridge line, coloured by which side rests at each level.
    ctx.globalAlpha = fade;
    ctx.lineWidth = i === 0 ? 2.5 : 1.25;
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k];
      if (a.bid + a.ask === 0 && b.bid + b.ask === 0) continue;
      const pa = P(xOf(a.price), yOf(a.bid + a.ask), z), pb = P(xOf(b.price), yOf(b.bid + b.ask), z);
      ctx.strokeStyle = b.price <= mid ? c.up : c.down;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const t of row.trades) {
      if (flags.tradeIds.has(t.id) && Math.abs(t.price - mid) <= half) marks.push(P(xOf(t.price), 0, z));
    }
  }

  // Opposite-side trades the Cop cited.
  for (const m of marks) {
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 9); ctx.lineTo(m.x + 7, m.y); ctx.lineTo(m.x, m.y + 9); ctx.lineTo(m.x - 7, m.y);
    ctx.closePath();
    ctx.fillStyle = c.cop; ctx.fill();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.stroke();
  }
  if (marks.length) tag(ctx, marks[0].x + 12, marks[0].y + 4, 'Opposite trade', c, false);
  if (wall) {
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wall.at.x, wall.at.y); ctx.lineTo(wall.at.x + 14, wall.at.y - 22); ctx.stroke();
  }
  if (wall) tag(ctx, wall.at.x + 14, wall.at.y - 22, `Wall: ${wall.qty} units`, c, true);

  // Price axis along the front, time labels down the left edge.
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let price = mid - half; price <= mid + half; price += 5) {
    const p = P(xOf(price), 0, 0);
    ctx.fillText(String(price), p.x, p.y + 8);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ((narrow ? [[0, 'now'], [50, '20 s ago']] : [[0, 'now'], [25, '10 s ago'], [50, '20 s ago']]) as [number, string][]).forEach(([i, label]) => {
    const p = P(-1, 0, zOf(i));
    ctx.fillText(label, p.x - 8, p.y);
  });
  if (rows.length < 3) {
    ctx.textAlign = 'center';
    ctx.fillText('Collecting the book…', w / 2, pad.t);
  }
}

function hazardPattern(ctx: CanvasRenderingContext2D, c: Palette): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 12;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.fillStyle = c.cop;
  t.fillRect(0, 0, 12, 12);
  t.strokeStyle = '#1a1712';
  t.lineWidth = 4;
  t.beginPath();
  for (const o of [-12, 0, 12]) { t.moveTo(o, 12); t.lineTo(o + 12, 0); }
  t.stroke();
  return ctx.createPattern(tile, 'repeat');
}

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, c: Palette, cop: boolean) {
  ctx.font = `700 13px ${c.sans}`;
  const width = ctx.measureText(text).width + 12;
  const left = Math.min(x, ctx.canvas.clientWidth - width - 4);
  ctx.fillStyle = cop ? c.cop : c.panel;
  ctx.fillRect(left, y - 11, width, 22);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(left, y - 11, width, 22);
  ctx.fillStyle = cop ? c.onCop : c.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 6, y);
}
