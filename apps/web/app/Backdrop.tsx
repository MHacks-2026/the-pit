'use client';

// Living backdrop, in the spirit of a blurred meadow at night: soft drifting bokeh lights, small twinkling glints,
// and a halftone dot spotlight that follows the pointer. Drawn with CSS only, no images and no libraries.
// Values are fixed (not random on render) so the server and the browser draw the same thing.

import { useEffect, useRef } from 'react';

type Bokeh = { x: number; y: number; size: number; color: string; dx: number; dy: number; dur: number; delay: number };

const BOKEH: Bokeh[] = [
  { x: 6, y: 78, size: 46, color: 'rgba(118, 160, 52, .30)', dx: 6, dy: -5, dur: 46, delay: 0 },
  { x: 24, y: 94, size: 36, color: 'rgba(60, 120, 70, .34)', dx: -5, dy: -7, dur: 52, delay: 6 },
  { x: 58, y: 100, size: 40, color: 'rgba(86, 140, 60, .24)', dx: 7, dy: -6, dur: 58, delay: 3 },
  { x: 88, y: 86, size: 34, color: 'rgba(120, 150, 50, .22)', dx: -6, dy: -5, dur: 50, delay: 9 },
  { x: 16, y: 34, size: 26, color: 'rgba(70, 92, 210, .30)', dx: 5, dy: 6, dur: 44, delay: 2 },
  { x: 40, y: 56, size: 22, color: 'rgba(96, 110, 230, .26)', dx: -7, dy: 4, dur: 40, delay: 8 },
  { x: 70, y: 28, size: 30, color: 'rgba(80, 76, 200, .28)', dx: 6, dy: 7, dur: 56, delay: 5 },
  { x: 92, y: 52, size: 24, color: 'rgba(100, 130, 240, .22)', dx: -5, dy: -6, dur: 48, delay: 11 },
  { x: 52, y: 14, size: 28, color: 'rgba(60, 130, 140, .22)', dx: 7, dy: 5, dur: 54, delay: 4 },
  { x: 2, y: 8, size: 24, color: 'rgba(110, 100, 220, .20)', dx: 6, dy: 6, dur: 42, delay: 7 },
  { x: 78, y: 70, size: 20, color: 'rgba(88, 120, 250, .20)', dx: -6, dy: -4, dur: 38, delay: 1 },
  { x: 34, y: 20, size: 18, color: 'rgba(150, 170, 70, .16)', dx: 5, dy: 6, dur: 60, delay: 10 },
];

function makeSparks() {
  let a = 20260314;
  const next = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  return Array.from({ length: 26 }, () => ({
    x: Math.round(next() * 1000) / 10,
    y: Math.round(next() * 1000) / 10,
    s: 6 + Math.round(next() * 10),
    dur: 3 + Math.round(next() * 40) / 10,
    delay: Math.round(next() * 60) / 10,
  }));
}
const SPARKS = makeSparks();

export default function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);

  // The halftone spotlight follows the pointer. This only sets two CSS values, so React never re-renders.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', `${e.clientX}px`);
        el.style.setProperty('--my', `${e.clientY}px`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="bg-motion" ref={ref} aria-hidden="true">
      {BOKEH.map((b, i) => (
        <i
          key={i}
          className="bokeh"
          style={{
            left: `${b.x}%`, top: `${b.y}%`, width: `${b.size}vmax`, height: `${b.size}vmax`,
            background: `radial-gradient(circle, ${b.color}, transparent 68%)`,
            ['--dx' as string]: `${b.dx}vmax`, ['--dy' as string]: `${b.dy}vmax`,
            animationDuration: `${b.dur}s`, animationDelay: `-${b.delay}s`,
          }}
        />
      ))}
      {SPARKS.map((s, i) => (
        <i key={i} className="spark" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDuration: `${s.dur}s`, animationDelay: `-${s.delay}s` }} />
      ))}
      <i className="halftone" />
      <i className="vignette" />
    </div>
  );
}
