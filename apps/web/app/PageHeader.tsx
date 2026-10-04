import JoinBadge from './JoinBadge';

// The same header on every page: label, Live pill, wordmark, subtitle, and the scan-to-join badge.
export default function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="screen-header">
      <div className="brand">
        <div className="brand-top">
          <p className="eyebrow">MHacks 2026 · Play money only</p>
          <div className="live-pill"><span className="live-dot" /> Live</div>
        </div>
        <h1>THE PIT</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <JoinBadge />
    </header>
  );
}
