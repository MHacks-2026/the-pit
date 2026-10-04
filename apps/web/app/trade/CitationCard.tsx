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

// Small seeded random, so the same citation always has the same toner speckle and typing wobble.
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

function draw(canvas: HTMLCanvasElement, c: CitationData) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rand = rng(c.seed * 7919 + 13);
  const L = 90;
  const R = 990;

  // typed text: each line sits a hair off the baseline and a little uneven in ink, like a real typewriter
  function typed(text: string, x: number, y: number, size: number, weight = 400, color = '#1a1a1a') {
    ctx!.save();
    ctx!.globalAlpha = 0.86 + rand() * 0.14;
    ctx!.fillStyle = color;
    ctx!.font = `${weight} ${size}px ${MONO}`;
    ctx!.fillText(text, x + (rand() - 0.5) * 1.2, y + (rand() - 0.5) * 1.6);
    ctx!.restore();
  }
  function rule(y: number, width = 2, dash: number[] = []) {
    ctx!.strokeStyle = '#1a1a1a';
    ctx!.lineWidth = width;
    ctx!.setLineDash(dash);
    ctx!.beginPath();
    ctx!.moveTo(L, y);
    ctx!.lineTo(R, y);
    ctx!.stroke();
    ctx!.setLineDash([]);
  }
  // "LABEL ........ typed value" on one line, like a filled-in form
  function line(label: string, value: string, y: number, valueColor = '#1a1a1a') {
    typed(label, L, y, 21, 400, '#555');
    const x = L + 250;
    const size = fitText(ctx!, value, R - x, 29, MONO, 700);
    typed(value, x, y, size, 700, valueColor);
    ctx!.strokeStyle = 'rgba(0, 0, 0, .35)';
    ctx!.lineWidth = 1.5;
    ctx!.setLineDash([2, 5]);
    ctx!.beginPath();
    ctx!.moveTo(x, y + 9);
    ctx!.lineTo(R, y + 9);
    ctx!.stroke();
    ctx!.setLineDash([]);
  }
  function mark(on: boolean, label: string, y: number) {
    typed(on ? '[X]' : '[ ]', L, y, 24, 700, on ? '#1a1a1a' : '#888');
    typed(label, L + 66, y, 23, on ? 700 : 400, on ? '#1a1a1a' : '#888');
  }

  // desk and plain white sheet
  ctx.fillStyle = '#c9c9c6';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fbfbf9';
  ctx.fillRect(40, 40, W - 80, H - 80);
  ctx.restore();
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.04 + rand() * 0.08})`;
    ctx.fillRect(40 + rand() * (W - 80), 40 + rand() * (H - 80), 1 + rand(), 1 + rand());
  }
  ctx.textBaseline = 'alphabetic';

  // letterhead
  typed('THE PIT EXCHANGE', L, 122, 38, 700);
  typed('MARKET COP DIVISION', L, 160, 24, 400, '#333');
  rule(186, 3);
  typed('NOTICE OF VIOLATION', L, 244, 34, 700);
  ctx.textAlign = 'right';
  typed(`No. ${c.no}`, R, 244, 30, 700);
  ctx.textAlign = 'left';
  rule(268, 1.5);

  // filled-in lines
  line('VIOLATOR', `${c.name} (${c.account})`, 326);
  line('DATE / TIME', `${c.when}  ${c.time}`, 376);
  line('MARKET', 'HACK / THE PIT', 426);
  line('OFFENSE', c.offense, 476);
  line('CODE', c.code, 526);
  line('CONFIDENCE', `${c.score} / 100`, 576);
  line('FINE', `${c.fine} POINTS`, 626);

  // findings, typed checklist
  typed('FINDINGS', L, 706, 22, 700);
  rule(718, 1.5);
  mark(c.layered, 'Layering: orders placed to fake depth', 762);
  mark(c.opposite, 'Trade made on the opposite side', 802);
  mark(c.cancelled, 'Orders pulled before they filled', 842);
  mark(false, 'Wash trading', 882);
  mark(false, 'Quote stuffing', 922);

  // officer's notes
  typed("OFFICER'S NOTES", L, 1002, 22, 700);
  rule(1014, 1.5);
  ctx.font = `400 26px ${MONO}`;
  wrap(ctx, c.text.toUpperCase(), R - L).slice(0, 5).forEach((ln, i) => typed(ln, L, 1058 + i * 38, 26));

  // evidence and disposition
  typed(`EVIDENCE: ${c.detail}`.toUpperCase().slice(0, 78), L, 1270, 19, 400, '#444');

  // signature, in pen
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, 1336);
  ctx.lineTo(480, 1336);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(106, 1316);
  ctx.bezierCurveTo(128, 1270, 148, 1336, 170, 1292);
  ctx.bezierCurveTo(186, 1264, 200, 1320, 228, 1300);
  ctx.bezierCurveTo(254, 1282, 272, 1318, 306, 1302);
  ctx.bezierCurveTo(342, 1286, 370, 1316, 430, 1296);
  ctx.stroke();
  typed('ISSUING OFFICER M. COP, BADGE 001', L, 1360, 14, 400, '#555');
  ctx.textAlign = 'right';
  typed('FICTIONAL AGENCY. PLAY MONEY ONLY. NO REAL FINES.', R, 1360, 14, 400, '#777');
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
