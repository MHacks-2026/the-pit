import TradePanel from './TradePanel';

export default function Trade() {
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">MHacks 2026 · Play money only</p>
          <h1>THE PIT</h1>
          <p className="subtitle">Buy or sell HACK on the live exchange.</p>
        </div>
        <div className="live-pill"><span className="live-dot" /> Live</div>
      </header>
      <section className="feed-shell" aria-labelledby="trade-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trader desk</p>
            <h2 id="trade-heading">Trade HACK</h2>
          </div>
          <p>Prices and quantities are whole numbers.</p>
        </div>
        <TradePanel />
      </section>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
