import TradePanel from './TradePanel';

export default function Trade() {
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">MHacks 2026 · play money only</p>
          <h1>THE PIT</h1>
          <p className="subtitle">Buy or sell HACK against the living exchange.</p>
        </div>
        <div className="live-pill"><span className="live-dot" /> LIVE MARKET</div>
      </header>
      <section className="feed-shell" aria-labelledby="trade-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trader desk</p>
            <h2 id="trade-heading">Trade HACK</h2>
          </div>
          <p>Prices are whole ticks. Quantities are whole units.</p>
        </div>
        <TradePanel />
      </section>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
