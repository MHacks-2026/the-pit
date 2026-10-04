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

type CitationData = { no: string; name: string; offense: string; code: string; score: number; fine: number; text: string; when: string; detail: string; seed: number };

// Small seeded random, so the same citation always has the same paper grain, stamp and signature.
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
const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Bradley Hand", "Segoe Script", "Noteworthy", "Comic Sans MS", cursive';
const INK = '#1c1c22';
const BLUE = '#1d3f8f';
const RED = '#b3261e';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string, weight = 700): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 20) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function field(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number, color = INK) {
  ctx.fillStyle = '#6a6459';
  ctx.font = `700 19px ${MONO}`;
  ctx.fillText(label, x, y);
  fitText(ctx, value, w, 36, SERIF, 700);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + 46);
  ctx.fillStyle = 'rgba(40, 34, 24, .35)';
  ctx.fillRect(x, y + 58, w, 2);
}

function draw(canvas: HTMLCanvasElement, c: CitationData) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rand = rng(c.seed * 7919 + 13);

  // desk
  const desk = ctx.createLinearGradient(0, 0, W, H);
  desk.addColorStop(0, '#23262e');
  desk.addColorStop(1, '#0d0f14');
  ctx.fillStyle = desk;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.012 + rand() * 0.02})`;
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
  }

  // the ticket, lying a little crooked, with a soft shadow
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.022);
  ctx.translate(-450, -630);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .6)';
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#f3eee2';
  ctx.fillRect(0, 0, 900, 1260);
  ctx.restore();

  // paper tone, grain and fibres
  const paper = ctx.createLinearGradient(0, 0, 0, 1260);
  paper.addColorStop(0, '#f7f3e8');
  paper.addColorStop(1, '#ebe4d3');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 900, 1260);
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = `rgba(95, 75, 45, ${0.03 + rand() * 0.07})`;
    ctx.fillRect(rand() * 900, rand() * 1260, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
  ctx.strokeStyle = 'rgba(120, 100, 70, .08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = rand() * 900;
    const y = rand() * 1260;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 26, y + (rand() - 0.5) * 26);
    ctx.stroke();
  }
  // a soft fold across the middle
  const fold = ctx.createLinearGradient(0, 600, 0, 680);
  fold.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fold.addColorStop(0.5, 'rgba(60, 45, 20, .09)');
  fold.addColorStop(1, 'rgba(255, 255, 255, .12)');
  ctx.fillStyle = fold;
  ctx.fillRect(0, 600, 900, 80);

  // header band
  ctx.fillStyle = '#16284a';
  ctx.fillRect(0, 0, 900, 128);
  ctx.fillStyle = '#e9d9a6';
  ctx.fillRect(0, 128, 900, 5);
  ctx.fillStyle = '#f3eee2';
  ctx.font = `700 42px ${SERIF}`;
  ctx.fillText('MARKET COP DIVISION', 50, 62);
  ctx.fillStyle = '#e9d9a6';
  ctx.font = `700 21px ${MONO}`;
  ctx.fillText('NOTICE OF VIOLATION  ·  THE PIT EXCHANGE', 50, 100);
  // badge
  ctx.strokeStyle = '#e9d9a6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(812, 64, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(812, 64, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e9d9a6';
  ctx.font = `700 22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('MC', 812, 72);
  ctx.textAlign = 'left';

  // serial number, rubber-stamped in red ink
  ctx.fillStyle = RED;
  ctx.font = `700 30px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(`No. ${c.no}`, 850, 186);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6a6459';
  ctx.font = `700 19px ${MONO}`;
  ctx.fillText('CITATION', 50, 186);

  // typed form fields
  field(ctx, 'VIOLATOR', c.name, 50, 232, 800);
  field(ctx, 'VIOLATION', c.offense, 50, 332, 470);
  field(ctx, 'CODE', c.code, 560, 332, 290);
  field(ctx, 'DATE / TIME', c.when, 50, 432, 470);
  field(ctx, 'MARKET', 'HACK · THE PIT', 560, 432, 290);
  field(ctx, 'CONFIDENCE', `${c.score} / 100`, 50, 532, 470);
  field(ctx, 'FINE', `${c.fine} points`, 560, 532, 290, RED);

  // officer's statement, handwritten on ruled lines
  ctx.fillStyle = '#6a6459';
  ctx.font = `700 19px ${MONO}`;
  ctx.fillText("OFFICER'S STATEMENT", 50, 650);
  ctx.strokeStyle = 'rgba(40, 60, 120, .22)';
  ctx.lineWidth = 1.5;
  ctx.font = `400 38px ${HAND}`;
  const lines = wrap(ctx, c.text, 800).slice(0, 6);
  for (let i = 0; i < 6; i++) {
    const y = 712 + i * 56;
    ctx.beginPath();
    ctx.moveTo(50, y + 12);
    ctx.lineTo(850, y + 12);
    ctx.stroke();
    if (lines[i]) {
      ctx.save();
      ctx.translate(54, y);
      ctx.rotate((rand() - 0.5) * 0.012);
      ctx.fillStyle = BLUE;
      ctx.fillText(lines[i], 0, 0);
      ctx.restore();
    }
  }

  // evidence, typed
  ctx.fillStyle = '#4a463d';
  ctx.font = `400 21px ${MONO}`;
  ctx.fillText(`EVIDENCE: ${c.detail}`.slice(0, 74), 50, 1070);

  // signature
  ctx.strokeStyle = 'rgba(40, 34, 24, .5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 1148);
  ctx.lineTo(420, 1148);
  ctx.stroke();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 1126);
  ctx.bezierCurveTo(90, 1070, 112, 1150, 134, 1100);
  ctx.bezierCurveTo(150, 1066, 166, 1140, 196, 1112);
  ctx.bezierCurveTo(222, 1090, 236, 1136, 270, 1116);
  ctx.bezierCurveTo(300, 1100, 330, 1132, 380, 1108);
  ctx.stroke();
  ctx.fillStyle = '#6a6459';
  ctx.font = `700 17px ${MONO}`;
  ctx.fillText('OFFICER M. COP  ·  BADGE 001', 50, 1174);

  // "CITED" stamp, with ink that did not quite take everywhere
  ctx.save();
  ctx.translate(690, 1112);
  ctx.rotate(-0.2);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 9;
  ctx.strokeRect(-150, -52, 300, 104);
  ctx.lineWidth = 3;
  ctx.strokeRect(-139, -41, 278, 82);
  ctx.font = `800 70px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CITED', 0, 4);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + rand() * 0.5})`;
    ctx.fillRect(-160 + rand() * 320, -60 + rand() * 120, 1 + rand() * 3, 1 + rand() * 3);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // perforation and tear-off stub
  ctx.strokeStyle = 'rgba(40, 34, 24, .45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.moveTo(0, 1196);
  ctx.lineTo(900, 1196);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#6a6459';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillText('DETACH AND KEEP', 50, 1224);
  // barcode from the citation number
  let x = 470;
  const bars = rng(c.seed * 31 + 5);
  ctx.fillStyle = INK;
  while (x < 850) {
    const w = 2 + Math.floor(bars() * 4);
    ctx.fillRect(x, 1210, w, 34);
    x += w + 2 + Math.floor(bars() * 3);
  }
  ctx.fillStyle = '#6a6459';
  ctx.font = `400 14px ${MONO}`;
  ctx.fillText('THE PIT · MHacks 2026 · Play money only. No real fines.', 50, 1246);

  // edge shading so it reads as a thing, not a rectangle
  const edge = ctx.createLinearGradient(0, 0, 900, 0);
  edge.addColorStop(0, 'rgba(0, 0, 0, .09)');
  edge.addColorStop(0.03, 'rgba(0, 0, 0, 0)');
  edge.addColorStop(0.97, 'rgba(0, 0, 0, 0)');
  edge.addColorStop(1, 'rgba(0, 0, 0, .09)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 900, 1260);
  ctx.restore();
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
    const when = new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    draw(canvasRef.current, {
      no, name, offense: offense(alert.kind), code: alert.kind === 'spoofing' || alert.kind.includes('spoof') ? 'MC-9.1' : 'MC-0.0',
      score: alert.score, fine: COP_PENALTY, text, when, detail, seed: Number(alert.id % 100000n),
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
