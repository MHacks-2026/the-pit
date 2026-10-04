import JoinBadge from './JoinBadge';

export default function PageHeader() {
  return (
    <header className="screen-header">
      <div className="brand">
        <div className="brand-top">
          <p className="eyebrow">MHacks 2026 · Play money only</p>
          <div className="live-pill"><span className="live-dot" /> Live</div>
        </div>
        <h1>THE PIT</h1>
      </div>
      <JoinBadge />
    </header>
  );
}
