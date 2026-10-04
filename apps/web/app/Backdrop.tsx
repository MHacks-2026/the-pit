'use client';

// Background: a few soft washes of pit green and chalk white that drift very slowly, plus the halftone dot
// spotlight that follows the pointer. CSS only (no images, no libraries); the pointer only updates two CSS values,
// so React never re-renders. Reduced motion stops the drift and the spotlight.

import { useEffect, useRef } from 'react';

export default function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);

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
    <div className="backdrop" ref={ref} aria-hidden="true">
      <i className="wash wash-green" />
      <i className="wash wash-chalk" />
      <i className="wash wash-green-2" />
      <i className="halftone" />
    </div>
  );
}
