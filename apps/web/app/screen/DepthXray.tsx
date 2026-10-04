'use client';

// 3D X-ray (T30/T36): the last 30 seconds of HACK order depth, drawn as a receding wireframe.
// Price runs left to right, resting size rises up, and each row is one 400 ms snapshot of the live book
// (newest in front). When the Cop raises an alert, the orders named in its evidence are hatched in every
// row still on screen, so a caught wall lights up after the fact. Plain canvas, no library.

import { useEffect, useRef } from 'react';

export type XrayOrder = { id: number; side: 'buy' | 'sell'; price: number; qty: number };
export type XrayTrade = { id: number; price: number };

type Level = { side: -1 | 1; orders: [number, number][] };
type Row = { levels: Map<number, Level>; mid: number; trades: XrayTrade[] };
type Colors = { bg: string; text: string; muted: string; line: string; buy: string; sell: string; cop: string; font: string };

const N = 41;
const MIDX = 20;
const T = 72;
const TICK_MS = 400;
const DZ = 0.5;
const YW = 14;
const RECENTRE = 4;
const YAW = 0.5;
const PITCH = 0.62;

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(`--${k}`).trim();
  return {
    bg: v('bg'), text: v('text'), muted: v('muted'), line: v('line'),
    buy: v('buy'), sell: v('sell'), cop: v('cop'),
    font: getComputedStyle(document.body).fontFamily,
  };
}

function hatch(ctx: CanvasRenderingContext2D, col: Colors): CanvasPattern | null {
  const off = document.createElement('canvas');
  off.width = 14; off.height = 14;
  const o = off.getContext('2d');
  if (!o) return null;
  o.fillStyle = col.cop; o.fillRect(0, 0, 14, 14);
  o.strokeStyle = col.bg; o.lineWidth = 4.5;
  o.beginPath(); o.moveTo(-3, 17); o.lineTo(17, -3); o.moveTo(-3, 3); o.lineTo(3, -3); o.moveTo(11, 17); o.lineTo(17, 11); o.stroke();
  return ctx.createPattern(off, 'repeat');
}

function snapshot(orders: XrayOrder[], fallbackMid: number): Row {
  const levels = new Map<number, Level>();
  let bestBid = -Infinity;
  let bestAsk = Infinity;
  for (const o of orders) {
    const side = o.side === 'buy' ? -1 : 1;
    let level = levels.get(o.price);
    if (!level) { level = { side, orders: [] }; levels.set(o.price, level); }
    level.orders.push([o.id, o.qty]);
    if (side < 0) bestBid = Math.max(bestBid, o.price); else bestAsk = Math.min(bestAsk, o.price);
  }
  const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? (bestBid + bestAsk) / 2
    : Number.isFinite(bestBid) ? bestBid : Number.isFinite(bestAsk) ? bestAsk : fallbackMid;
  return { levels, mid, trades: [] };
}

export default function DepthXray({ orders, trades, flaggedOrders, flaggedTrades }: {
  orders: XrayOrder[];
  trades: XrayTrade[];
  flaggedOrders: Set<number>;
  flaggedTrades: Set<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ yaw: YAW, pitch: PITCH });
  const live = useRef({ orders, trades, flaggedOrders, flaggedTrades });
  live.current = { orders, trades, flaggedOrders, flaggedTrades };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const view = viewRef.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let col = readColors();
    let pattern = hatch(ctx, col);
    let W = 0, H = 0, dpr = 1;
    const rows: Row[] = [];
    const seenTrades = new Set<number>();
    let primed = false;
    let center = 100;
    let lastMid = 100;
    let scale = YW / 20, scaleTarget = scale;
    let acc = 0, frac = 0, last = 0, raf = 0;
    let dirty = true;

    function resize() {
      W = canvas!.clientWidth || 600; H = canvas!.clientHeight || 375; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(W * dpr); canvas!.height = Math.round(H * dpr);
    }

    function tick() {
      const { orders: book, trades: tape } = live.current;
      const row = snapshot(book, lastMid);
      lastMid = row.mid;
      for (const t of tape) {
        if (seenTrades.has(t.id)) continue;
        seenTrades.add(t.id);
        if (primed) row.trades.push(t);
      }
      if (!primed) { primed = true; center = Math.round(row.mid); }
      if (Math.abs(row.mid - center) > RECENTRE) center = Math.round(row.mid);
      rows.unshift(row);
      if (rows.length > T) rows.pop();
      let maxQty = 10;
      for (const r of rows) for (const l of r.levels.values()) {
        let q = 0;
        for (const [, qty] of l.orders) q += qty;
        if (q > maxQty) maxQty = q;
      }
      scaleTarget = YW / maxQty;
    }

    function draw() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.globalAlpha = 1; ctx!.fillStyle = col.bg; ctx!.fillRect(0, 0, W, H);
      const { flaggedOrders: flagged, flaggedTrades: flaggedT } = live.current;
      const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const ZC = T * DZ / 2, D = 60, half = (N - 1) / 2;
      const raw = (x: number, y: number, z: number) => {
        const zz = z - ZC, x1 = x * cyw + zz * syw, z1 = -x * syw + zz * cyw, y2 = y * cp + z1 * sp, dep = z1 * cp - y * sp + D, s = D / dep;
        return [x1 * s, -y2 * s];
      };
      const xr = N / 2 + 3.2, ymax = YW * 0.85, zmin = -2.6, zmax = T * DZ;
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const c of [[-xr, 0, zmin], [xr, 0, zmin], [-xr, 0, zmax], [xr, 0, zmax], [-xr, ymax, zmin], [xr, ymax, zmin], [-xr, ymax, zmax], [xr, ymax, zmax]]) {
        const p = raw(c[0], c[1], c[2]);
        minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
      }
      const m = 16, k = Math.min((W - 2 * m) / (maxx - minx), (H - 2 * m) / (maxy - miny));
      const ox = W / 2 - k * (minx + maxx) / 2, oy = H / 2 - k * (miny + maxy) / 2;
      const P = (x: number, y: number, z: number) => { const p = raw(x, y, z); return [ox + k * p[0], oy + k * p[1]]; };
      const lo = center - MIDX;

      const h = new Float32Array(N), b = new Float32Array(N), sd = new Int8Array(N), f = new Uint8Array(N);
      let wallAnchor: { x: number; y: number; z: number; units: number } | null = null;
      let tradeMark: number[] | null = null;
      for (let j = rows.length - 1; j >= 0; j--) {
        const row = rows[j], z = (j + frac) * DZ;
        for (let i = 0; i < N; i++) {
          const price = lo + i, level = row.levels.get(price);
          let base = 0, wall = 0;
          if (level) for (const [id, qty] of level.orders) { if (flagged.has(id)) wall += qty; else base += qty; }
          b[i] = base; h[i] = base + wall; f[i] = wall > 0 ? 1 : 0;
          sd[i] = level ? level.side : price < row.mid ? -1 : price > row.mid ? 1 : 0;
        }

        let a = P(-N / 2, 0, z);
        ctx!.globalAlpha = 1; ctx!.beginPath(); ctx!.moveTo(a[0], a[1]);
        for (let i = 0; i < N; i++) {
          const pl = P(i - 0.5 - half, h[i] * scale, z), pr = P(i + 0.5 - half, h[i] * scale, z);
          ctx!.lineTo(pl[0], pl[1]); ctx!.lineTo(pr[0], pr[1]);
        }
        a = P(N / 2, 0, z); ctx!.lineTo(a[0], a[1]); ctx!.closePath(); ctx!.fillStyle = col.bg; ctx!.fill();

        let sumW = 0, sx = 0, cnt = 0, topY = 0;
        for (let i = 0; i < N; i++) {
          if (!f[i]) continue;
          sumW += h[i] - b[i]; sx += i; cnt++; topY = Math.max(topY, h[i]);
          const q1 = P(i - 0.5 - half, b[i] * scale, z), q2 = P(i + 0.5 - half, b[i] * scale, z);
          const q3 = P(i + 0.5 - half, h[i] * scale, z), q4 = P(i - 0.5 - half, h[i] * scale, z);
          ctx!.beginPath(); ctx!.moveTo(q1[0], q1[1]); ctx!.lineTo(q2[0], q2[1]); ctx!.lineTo(q3[0], q3[1]); ctx!.lineTo(q4[0], q4[1]); ctx!.closePath();
          ctx!.fillStyle = pattern ?? col.cop; ctx!.fill(); ctx!.strokeStyle = col.text; ctx!.lineWidth = 1.6; ctx!.stroke();
        }
        if (cnt) wallAnchor = { x: sx / cnt - half, y: topY * scale, z, units: Math.round(sumW) };

        const fade = 1 - 0.68 * (j / T);
        ctx!.globalAlpha = fade; ctx!.lineWidth = 1 + 0.7 * (1 - j / T);
        let cur: string | null = null;
        for (let i = 0; i < N; i++) {
          const c = f[i] ? col.text : sd[i] < 0 ? col.buy : sd[i] > 0 ? col.sell : col.muted;
          const pl = P(i - 0.5 - half, h[i] * scale, z), pr = P(i + 0.5 - half, h[i] * scale, z);
          if (c !== cur) {
            if (cur !== null) { ctx!.lineTo(pl[0], pl[1]); ctx!.stroke(); }
            ctx!.beginPath(); ctx!.strokeStyle = c; ctx!.moveTo(pl[0], pl[1]); cur = c;
          } else ctx!.lineTo(pl[0], pl[1]);
          ctx!.lineTo(pr[0], pr[1]);
        }
        ctx!.stroke();

        for (const t of row.trades) {
          const i = t.price - lo;
          if (i < 0 || i >= N) continue;
          if (flaggedT.has(t.id)) {
            const tp = P(i - half, (h[i] + 5) * scale, z), s = 9;
            ctx!.globalAlpha = 1;
            ctx!.beginPath(); ctx!.moveTo(tp[0], tp[1] - s); ctx!.lineTo(tp[0] + s, tp[1]); ctx!.lineTo(tp[0], tp[1] + s); ctx!.lineTo(tp[0] - s, tp[1]); ctx!.closePath();
            ctx!.fillStyle = col.text; ctx!.fill(); ctx!.strokeStyle = col.bg; ctx!.lineWidth = 2; ctx!.stroke();
            tradeMark = tp;
          } else {
            const dp = P(i - half, (h[i] + 1.4) * scale, z);
            ctx!.globalAlpha = 0.75 * fade; ctx!.fillStyle = col.text;
            ctx!.beginPath(); ctx!.arc(dp[0], dp[1], 2.2, 0, Math.PI * 2); ctx!.fill();
          }
        }
      }
      ctx!.globalAlpha = 1;

      const e1 = P(-N / 2, 0, -0.4), e2 = P(N / 2, 0, -0.4);
      ctx!.strokeStyle = col.text; ctx!.lineWidth = 2; ctx!.beginPath(); ctx!.moveTo(e1[0], e1[1]); ctx!.lineTo(e2[0], e2[1]); ctx!.stroke();
      ctx!.font = `600 12px ${col.font}`; ctx!.textAlign = 'center'; ctx!.fillStyle = col.muted;
      for (let i = 0; i < N; i++) {
        if ((lo + i) % 5 !== 0) continue;
        const tk = P(i - half, 0, -0.4), lb = P(i - half, 0, -1.9);
        ctx!.strokeStyle = col.text; ctx!.lineWidth = 1.5; ctx!.beginPath(); ctx!.moveTo(tk[0], tk[1]); ctx!.lineTo(tk[0], tk[1] + 5); ctx!.stroke();
        ctx!.fillText(String(lo + i), lb[0], lb[1] + 8);
      }
      ctx!.textAlign = 'left';
      for (const [sec, label] of [[0, 'now'], [10, '10 s ago'], [20, '20 s ago'], [28.8, '30 s ago']] as const) {
        const z = (sec * 1000 / TICK_MS + frac) * DZ, lp = P(N / 2 + 0.6, 0, Math.min(z, zmax));
        ctx!.fillText(label, lp[0] + 3, lp[1] + 4);
      }

      ctx!.font = `700 14px ${col.font}`;
      if (wallAnchor) {
        const wp = P(wallAnchor.x, wallAnchor.y + 3.2, wallAnchor.z), txt = `Wall: ${wallAnchor.units} units`;
        ctx!.textAlign = 'center';
        const tw = ctx!.measureText(txt).width + 14;
        ctx!.fillStyle = col.cop; ctx!.fillRect(wp[0] - tw / 2, wp[1] - 17, tw, 22);
        ctx!.strokeStyle = col.text; ctx!.lineWidth = 2; ctx!.strokeRect(wp[0] - tw / 2, wp[1] - 17, tw, 22);
        ctx!.fillStyle = col.bg; ctx!.fillText(txt, wp[0], wp[1] - 1);
      }
      if (tradeMark) {
        const txt = 'Opposite trade';
        ctx!.textAlign = 'left';
        const tw = ctx!.measureText(txt).width + 14;
        ctx!.fillStyle = col.bg; ctx!.fillRect(tradeMark[0] + 14, tradeMark[1] - 11, tw, 22);
        ctx!.strokeStyle = col.text; ctx!.lineWidth = 2; ctx!.strokeRect(tradeMark[0] + 14, tradeMark[1] - 11, tw, 22);
        ctx!.fillStyle = col.text; ctx!.fillText(txt, tradeMark[0] + 21, tradeMark[1] + 5);
      }
      ctx!.textAlign = 'left';
    }

    function frame(now: number) {
      const dt = Math.min(250, now - last); last = now; acc += dt;
      let ticked = false;
      while (acc >= TICK_MS) { acc -= TICK_MS; tick(); ticked = true; }
      scale += (scaleTarget - scale) * (reduce ? 1 : 0.08);
      frac = reduce ? 0 : acc / TICK_MS;
      if (!reduce || ticked || dirty) { draw(); dirty = false; }
      raf = requestAnimationFrame(frame);
    }

    let drag: { x: number; y: number } | null = null;
    const rotate = (dyaw: number, dpitch: number) => {
      view.yaw = clamp(view.yaw + dyaw, -0.95, 0.95);
      view.pitch = clamp(view.pitch + dpitch, 0.22, 0.98);
      dirty = true;
    };
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      rotate((e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { drag = null; };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') rotate(-0.06, 0);
      else if (e.key === 'ArrowRight') rotate(0.06, 0);
      else if (e.key === 'ArrowUp') rotate(0, -0.04);
      else if (e.key === 'ArrowDown') rotate(0, 0.04);
      else return;
      e.preventDefault();
    };
    const onReset = () => { dirty = true; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('xray-reset', onReset);

    resize();
    const ro = new ResizeObserver(() => { resize(); dirty = true; });
    ro.observe(canvas);
    document.fonts?.ready.then(() => { col = readColors(); pattern = hatch(ctx, col); dirty = true; });
    raf = requestAnimationFrame(t => { last = t; tick(); raf = requestAnimationFrame(frame); });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('xray-reset', onReset);
    };
  }, []);

  const reset = () => {
    viewRef.current.yaw = YAW;
    viewRef.current.pitch = PITCH;
    canvasRef.current?.dispatchEvent(new Event('xray-reset'));
  };

  return (
    <div className="xray">
      <canvas
        ref={canvasRef}
        className="xray-canvas"
        tabIndex={0}
        role="img"
        aria-label="Three-dimensional chart of HACK order depth by price over the last 30 seconds. Drag or use arrow keys to rotate."
      />
      <div className="xray-bar">
        <button type="button" className="xray-btn" onClick={reset}>Reset view</button>
        <ul className="xray-legend">
          <li><span className="xray-sw xray-sw-bid" />Bids</li>
          <li><span className="xray-sw xray-sw-ask" />Asks</li>
          <li><span className="xray-sw xray-sw-flag" />Orders the Cop flagged</li>
          <li><span className="xray-dia" />Opposite trade</li>
          <li>Newest depth is in front.</li>
        </ul>
      </div>
    </div>
  );
}
