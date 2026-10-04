'use client';

// Citation card (T34): when the Market Cop catches you, your phone shows an official-looking card.
// The wording comes from /api/narrate (LLM, with its own template fallback); if that fails we write it here.
// The card is drawn on a canvas, so "Download" gives a real PNG. No extra libraries.

import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';
import { COP_PENALTY } from '../../lib/copScore';

const W = 1080;
const H = 1440;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

type Evidence = { layerOrderIds?: number[]; cancelledQty?: number; totalLayeredQty?: number; oppositeTradeId?: number };

function parseEvidence(raw: string): Evidence | null {
  try { return JSON.parse(raw) as Evidence; } catch { return null; }
}

function offense(kind: string): string {
  const words = kind.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fallbackText(name: string, score: number, ev: Evidence | null): string {
  if (ev?.layerOrderIds && ev.cancelledQty !== undefined && ev.totalLayeredQty !== undefined) {
    return `${name} placed ${ev.layerOrderIds.length} layered orders, canceled ${ev.cancelledQty} of ${ev.totalLayeredQty} units, and traded on the other side. Spoofing score ${score} out of 100.`;
  }
  return `${name} was flagged by the Market Cop for suspicious order activity. Spoofing score ${score} out of 100.`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type CitationData = {
  no: string; account: string; name: string; offense: string; code: string; score: number; fine: number;
  text: string; when: string; time: string; detail: string; seed: number;
  layered: boolean; opposite: boolean; cancelled: boolean;
};

// Small seeded random, so the same citation always has the same toner speckle and signature.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONO = '"Courier New", Courier, monospace';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string, weight = 700): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 16) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

// One bordered cell of the form: small printed label in the corner, typed value underneath.
function cell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, value: string) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#444';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillText(label, x + 10, y + 22);
  ctx.fillStyle = '#111';
  fitText(ctx, value, w - 24, 30, MONO, 700);
  ctx.fillText(value, x + 12, y + h - 16);
}

function bar(ctx: CanvasRenderingContext2D, y: number, text: string) {
  ctx.fillStyle = '#111';
  ctx.fillRect(80, y, 920, 38);
  ctx.fillStyle = '#fff';
  ctx.font = `700 18px ${SANS}`;
  ctx.fillText(text, 92, y + 25);
}

function check(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, label: string) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y - 18, 22, 22);
  if (on) {
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 14);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x + 18, y - 14);
    ctx.lineTo(x + 4, y);
    ctx.stroke();
  }
  ctx.fillStyle = on ? '#111' : '#777';
  ctx.font = `${on ? 700 : 400} 22px ${MONO}`;
  ctx.fillText(label, x + 38, y);
}

function draw(canvas: HTMLCanvasElement, c: CitationData) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rand = rng(c.seed * 7919 + 13);

  // desk and sheet: plain, flat, like a clean scan
  ctx.fillStyle = '#c9c9c6';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fbfbf9';
  ctx.fillRect(40, 40, W - 80, H - 80);
  ctx.restore();
  // light toner speckle
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.04 + rand() * 0.08})`;
    ctx.fillRect(40 + rand() * (W - 80), 40 + rand() * (H - 80), 1 + rand(), 1 + rand());
  }
  ctx.textBaseline = 'alphabetic';

  // letterhead
  ctx.fillStyle = '#111';
  ctx.font = `800 40px ${SANS}`;
  ctx.fillText('THE PIT EXCHANGE', 80, 112);
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText('MARKET COP DIVISION', 80, 148);
  ctx.fillStyle = '#444';
  ctx.font = `700 19px ${MONO}`;
  ctx.fillText('NOTICE OF VIOLATION AND CITATION', 80, 182);

  // citation number box
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  ctx.strokeRect(720, 80, 280, 110);
  ctx.fillStyle = '#444';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillText('CITATION NO.', 732, 104);
  ctx.fillStyle = '#111';
  fitText(ctx, c.no, 256, 44, MONO, 700);
  ctx.fillText(c.no, 732, 164);

  ctx.fillStyle = '#111';
  ctx.fillRect(80, 206, 920, 6);

  // form
  cell(ctx, 80, 228, 640, 84, 'VIOLATOR', c.name);
  cell(ctx, 720, 228, 280, 84, 'ACCOUNT ID', c.account);
  cell(ctx, 80, 312, 340, 84, 'DATE', c.when);
  cell(ctx, 420, 312, 300, 84, 'TIME', c.time);
  cell(ctx, 720, 312, 280, 84, 'MARKET', 'HACK / THE PIT');
  cell(ctx, 80, 396, 640, 84, 'VIOLATION', c.offense);
  cell(ctx, 720, 396, 280, 84, 'CODE', c.code);
  cell(ctx, 80, 480, 340, 84, 'CONFIDENCE', `${c.score} / 100`);
  cell(ctx, 420, 480, 300, 84, 'FINE ASSESSED', `${c.fine} PTS`);
  cell(ctx, 720, 480, 280, 84, 'STATUS', 'ISSUED');

  // violation checklist
  bar(ctx, 588, 'VIOLATION DETAILS');
  check(ctx, 92, 672, c.layered, 'LAYERING  Orders placed to fake market depth');
  check(ctx, 92, 716, c.opposite, 'OPPOSITE-SIDE TRADE  Executed against own layers');
  check(ctx, 92, 760, c.cancelled, 'MASS CANCELLATION  Orders pulled before filling');
  check(ctx, 92, 804, false, 'WASH TRADING  Trading against oneself');
  check(ctx, 92, 848, false, 'QUOTE STUFFING  Excessive order messages');

  // narrative
  bar(ctx, 876, "OFFICER'S NARRATIVE");
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 914, 920, 232);
  ctx.fillStyle = '#111';
  ctx.font = `400 27px ${MONO}`;
  wrap(ctx, c.text.toUpperCase(), 890).slice(0, 5).forEach((line, i) => ctx.fillText(line, 96, 956 + i * 42));

  // evidence and disposition
  ctx.fillStyle = '#333';
  ctx.font = `400 20px ${MONO}`;
  ctx.fillText(`EVIDENCE: ${c.detail}`.toUpperCase().slice(0, 78), 80, 1182);
  ctx.fillStyle = '#555';
  ctx.font = `400 17px ${SANS}`;
  wrap(ctx, `A fine of ${c.fine} points has been applied to your Beat the Cop score. Continued manipulation of the order book may result in further citations. Payment is not required in play dollars.`, 920)
    .slice(0, 3)
    .forEach((line, i) => ctx.fillText(line, 80, 1214 + i * 24));

  // signatures
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 1316);
  ctx.lineTo(480, 1316);
  ctx.moveTo(560, 1316);
  ctx.lineTo(1000, 1316);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(96, 1296);
  ctx.bezierCurveTo(118, 1250, 138, 1316, 160, 1272);
  ctx.bezierCurveTo(176, 1244, 190, 1300, 218, 1280);
  ctx.bezierCurveTo(244, 1262, 262, 1298, 296, 1282);
  ctx.bezierCurveTo(332, 1266, 360, 1296, 420, 1276);
  ctx.stroke();
  ctx.fillStyle = '#444';
  ctx.font = `700 13px ${SANS}`;
  ctx.fillText('ISSUING OFFICER  M. COP, BADGE 001', 80, 1338);
  ctx.fillText('VIOLATOR  (SIGNATURE NOT REQUIRED)', 560, 1338);

  // barcode and fine print
  let x = 80;
  const bars = rng(c.seed * 31 + 5);
  ctx.fillStyle = '#111';
  while (x < 330) {
    const w = 2 + Math.floor(bars() * 4);
    ctx.fillRect(x, 1352, w, 24);
    x += w + 2 + Math.floor(bars() * 3);
  }
  ctx.fillStyle = '#666';
  ctx.font = `400 13px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText('FICTIONAL AGENCY. THE PIT, MHACKS 2026. PLAY MONEY ONLY.', 1000, 1370);
  ctx.textAlign = 'left';
}

export default function CitationCard({ myHex, name }: { myHex: string; name: string }) {
  const [alerts] = useTable(tables.alert);
  const mine = alerts
    .filter(a => a.owner.toHexString() === myHex)
    .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? 1 : -1));
  const alert = mine[0] ?? null;

  const [text, setText] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const alertId = alert ? alert.id.toString() : null;
  const stored = alert?.narration ?? null;

  // Get the wording once per alert.
  useEffect(() => {
    if (!alert || !alertId) return;
    const ev = parseEvidence(alert.evidence);
    if (stored) { setText(stored); return; }
    setText(fallbackText(name, alert.score, ev)); // shows instantly, replaced if the LLM answers
    let cancelled = false;
    fetch('/api/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alert: { kind: alert.kind, score: alert.score, trader: name, evidence: ev } }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((res: { text?: string } | null) => { if (!cancelled && res?.text) setText(res.text); })
      .catch(() => { /* keep the fallback wording */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId, stored, name]);

  const no = alertId ? `PIT-${alertId.padStart(4, '0')}` : '';

  useEffect(() => {
    if (!alert || !text || !canvasRef.current) return;
    const ev = parseEvidence(alert.evidence);
    const detail = ev?.layerOrderIds && ev.cancelledQty !== undefined && ev.totalLayeredQty !== undefined
      ? `${ev.layerOrderIds.length} layered orders · ${ev.cancelledQty}/${ev.totalLayeredQty} units canceled`
      : 'Evidence on file with the Market Cop';
    const d = new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n));
    const when = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const spoof = alert.kind.includes('spoof');
    draw(canvasRef.current, {
      no, account: myHex.slice(0, 8).toUpperCase(), name, offense: offense(alert.kind), code: spoof ? 'MC-9.1' : 'MC-0.0',
      score: alert.score, fine: COP_PENALTY, text, when, time, detail, seed: Number(alert.id % 100000n),
      layered: spoof || (ev?.layerOrderIds?.length ?? 0) > 1,
      opposite: spoof || ev?.oppositeTradeId !== undefined,
      cancelled: spoof || (ev?.cancelledQty ?? 0) > 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId, text, name, no]);

  if (!alert) return null;

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${no.toLowerCase()}-citation.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  return (
    <div className="cite-box">
      <h3 className="trade-orders-title">You’ve been cited</h3>
      <p className="join-hint">The Market Cop caught you{mine.length > 1 ? ` ${mine.length} times. This is your latest citation.` : '. Here is your citation.'}</p>
      <canvas ref={canvasRef} className="cite-canvas" width={W} height={H} role="img" aria-label={`Citation ${no} for ${offense(alert.kind)}, score ${alert.score} out of 100`} />
      <button type="button" className="join-button" onClick={download}>Download citation</button>
    </div>
  );
}
