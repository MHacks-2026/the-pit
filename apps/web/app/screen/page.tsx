import AlertFeed from './AlertFeed';

export default function Screen() {
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">MHacks 2026 · play money only</p>
          <h1>THE PIT</h1>
          <p className="subtitle">A living exchange. A watchful market cop.</p>
        </div>
        <div className="live-pill"><span className="live-dot" /> LIVE MARKET</div>
      </header>
      <section className="feed-shell" aria-labelledby="alerts-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Surveillance desk</p>
            <h2 id="alerts-heading">Market Cop alerts</h2>
          </div>
          <p>Evidence from the live order stream</p>
        </div>
        <AlertFeed />
      </section>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
