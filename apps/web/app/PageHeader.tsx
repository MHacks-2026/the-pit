import JoinBadge from './JoinBadge';

// The same header on every page: wordmark, live status, one line about the page, and the scan-to-join badge.
export default function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="masthead">
      <div className="masthead-brand">
        <h1 className="wordmark">The Pit</h1>
        <p className="masthead-line">
          <span className="live"><span className="live-dot" aria-hidden="true" />Live</span>
          {subtitle}
        </p>
      </div>
      <JoinBadge />
    </header>
  );
}
