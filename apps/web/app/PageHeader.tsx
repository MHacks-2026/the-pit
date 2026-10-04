import JoinBadge from './JoinBadge';

// The same header on every page, in the case-file style: typewriter title, one line about the page, a boxed note,
// and the scan-to-join badge.
export default function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="masthead">
      <div className="masthead-brand">
        <h1 className="wordmark">The Pit</h1>
        <p className="masthead-line">{subtitle}</p>
        <p className="note"><span className="live-dot" aria-hidden="true" />Live market. Play money only.</p>
      </div>
      <JoinBadge />
    </header>
  );
}
