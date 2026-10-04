import type { CSSProperties } from 'react';
import { badgeFor } from '../lib/badges';

/** A trader's floor badge: their jacket colour and short code. Bots wear an outlined badge, players a filled one. */
export default function TraderBadge({ name, isBot }: { name: string; isBot: boolean }) {
  const badge = badgeFor(name, isBot);
  return (
    <span className={isBot ? 'badge badge-bot' : 'badge'} title={isBot ? `${name} (bot)` : name}
      style={{ '--jacket': badge.jacket, '--ink': badge.ink } as CSSProperties}>
      {badge.code}
      {isBot ? <span className="visually-hidden"> bot</span> : null}
    </span>
  );
}
