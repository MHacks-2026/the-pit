'use client';

// Citation card (T34): when the Market Cop catches you, your phone shows an official-looking card.
// The wording comes from /api/narrate (LLM, with its own template fallback); if that fails we write it here.
// The card is drawn on a canvas, so "Download" gives a real PNG. No extra libraries.

import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';

const W = 1080;
const H = 1350;
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

function draw(canvas: HTMLCanvasElement, c: { no: string; name: string; offense: string; score: number; text: string; when: string; detail: string }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 900);
  glow.addColorStop(0, 'rgba(255, 159, 10, 0.28)');
  glow.addColorStop(1, 'rgba(255, 159, 10, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // card
  roundRect(ctx, 60, 60, W - 120, H - 120, 48);
  ctx.fillStyle = '#1c1c1e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();
  ctx.fillStyle = '#ff9f0a';
  ctx.fillRect(60, 60 + 40, 10, 200);

  const left = 130;
  ctx.textBaseline = 'alphabetic';

  // header
  ctx.fillStyle = '#ff9f0a';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('MARKET COP', left, 160);
  ctx.fillStyle = '#98989d';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText('OFFICIAL CITATION', left, 208);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5f5f7';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(c.no, W - 130, 160);
  ctx.fillStyle = '#98989d';
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(c.when, W - 130, 204);
  ctx.textAlign = 'left';

  // divider
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(left, 270, W - 260, 2);

  // name
  ctx.fillStyle = '#98989d';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('ISSUED TO', left, 350);
  ctx.fillStyle = '#f5f5f7';
  let size = 104;
  ctx.font = `700 ${size}px ${FONT}`;
  while (ctx.measureText(c.name).width > W - 260 && size > 48) {
    size -= 4;
    ctx.font = `700 ${size}px ${FONT}`;
  }
  ctx.fillText(c.name, left, 350 + size + 8);

  // offense
  const oy = 350 + size + 90;
  ctx.fillStyle = '#98989d';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('OFFENSE', left, oy);
  ctx.fillStyle = '#ffb340';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(c.offense, left, oy + 76);

  // score
  const sy = oy + 160;
  ctx.fillStyle = '#98989d';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('CONFIDENCE', left, sy);
  ctx.fillStyle = '#f5f5f7';
  ctx.font = `700 120px ${FONT}`;
  ctx.fillText(String(c.score), left, sy + 120);
  const scoreW = ctx.measureText(String(c.score)).width;
  ctx.fillStyle = '#98989d';
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText('/ 100', left + scoreW + 20, sy + 120);

  // narration
  const ty = sy + 220;
  ctx.fillStyle = '#d1d1d6';
  ctx.font = `500 44px ${FONT}`;
  const lines = wrap(ctx, c.text, W - 260).slice(0, 6);
  lines.forEach((line, i) => ctx.fillText(line, left, ty + i * 62));

  // evidence + footer
  ctx.fillStyle = '#98989d';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(c.detail, left, H - 190);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(left, H - 160, W - 260, 2);
  ctx.fillStyle = '#64d2ff';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('THE PIT', left, H - 100);
  ctx.fillStyle = '#98989d';
  ctx.font = `500 28px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('MHacks 2026 · Play money only', W - 130, H - 100);
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
    const when = new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    draw(canvasRef.current, { no, name, offense: offense(alert.kind), score: alert.score, text, when, detail });
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
