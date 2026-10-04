'use client';

// Thin ticker under the header: price, recent trades, Cop alerts (amber), news, leader, one call to action.
// Pauses on hover and with the button (accessibility); stops entirely if the visitor prefers reduced motion.

import { useState } from 'react';

export type MarqueeItem = { id: string; kind: 'price' | 'buy' | 'sell' | 'cop' | 'news' | 'leader' | 'cta'; label: string; value?: string };

function Item({ it }: { it: MarqueeItem }) {
  return (
    <span className={`mq-item mq-${it.kind}`}>
      <span className="mq-label">{it.label}</span>
      {it.value ? <b className="mq-value">{it.value}</b> : null}
    </span>
  );
}

export default function Marquee({ items }: { items: MarqueeItem[] }) {
  const [paused, setPaused] = useState(false);
  if (items.length === 0) return null;
  // Longer lists scroll at the same speed, so tie the duration to the number of items.
  const seconds = Math.max(40, items.length * 7);
  return (
    <div className="mq" role="region" aria-label="Market ticker">
      <div className="mq-mask">
        <div className={`mq-track${paused ? ' mq-paused' : ''}`} style={{ animationDuration: `${seconds}s` }}>
          <div className="mq-set">{items.map(it => <Item key={it.id} it={it} />)}</div>
          <div className="mq-set" aria-hidden="true">{items.map(it => <Item key={`d${it.id}`} it={it} />)}</div>
        </div>
      </div>
      <button type="button" className="mq-btn" onClick={() => setPaused(p => !p)} aria-pressed={paused} aria-label={paused ? 'Resume ticker' : 'Pause ticker'}>
        {paused ? '▶' : '❚❚'}
      </button>
    </div>
  );
}
