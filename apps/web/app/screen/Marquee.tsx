'use client';

// Thin ticker under the header: price, recent trades, Cop alerts (amber), news, leader, one call to action.
// Pauses on hover and with the button (accessibility); stops entirely if the visitor prefers reduced motion.

import { useState } from 'react';

export type MarqueeItem = { id: string; kind: 'price' | 'buy' | 'sell' | 'cop' | 'news' | 'leader' | 'cta'; label: string; value?: string };

function Item({ it, hidden = false }: { it: MarqueeItem; hidden?: boolean }) {
  return (
    <span className={`mq-item mq-${it.kind}`} aria-hidden={hidden}>
      <span className="mq-label">{it.label}</span>
      {it.value ? <b className="mq-value">{it.value}</b> : null}
    </span>
  );
}

export default function Marquee({ items }: { items: MarqueeItem[] }) {
  const [paused, setPaused] = useState(false);
  if (items.length === 0) return null;
  const loop = Array.from({ length: 12 }, (_, index) => ({ item: items[index % items.length], hidden: index >= items.length }));
  return (
    <div className="mq" role="region" aria-label="Market ticker">
      <div className="mq-mask">
        <div className={`mq-track${paused ? ' mq-paused' : ''}`}>
          <div className="mq-set">{loop.map(({ item, hidden }, index) => <Item key={index} it={item} hidden={hidden} />)}</div>
          <div className="mq-set" aria-hidden="true">{loop.map(({ item }, index) => <Item key={index} it={item} />)}</div>
        </div>
      </div>
      <button type="button" className="mq-btn" onClick={() => setPaused(p => !p)} aria-pressed={paused} aria-label={paused ? 'Resume ticker' : 'Pause ticker'}>
        {paused ? '▶' : '❚❚'}
      </button>
    </div>
  );
}
