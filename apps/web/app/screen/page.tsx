import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';

export default function Screen() {
  return (
    <main className="screen">
      <header className="screen-header">
        <div className="brand">
          <div className="brand-top">
            <p className="eyebrow">MHacks 2026 · Play money only</p>
            <div className="live-pill"><span className="live-dot" /> Live</div>
          </div>
          <h1>THE PIT</h1>
          <p className="subtitle">A living exchange. A watchful Market Cop.</p>
        </div>
        <a className="qr-badge" href="/join" aria-label="Scan to trade, join in 15 seconds">
          <span className="qr-badge-code">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/join-qr.svg" alt="QR code for the-pit-seven.vercel.app/join" width={112} height={112} />
          </span>
          <span className="qr-badge-copy">
            <b>Scan to trade</b>
            <span>Join in 15 seconds</span>
            <small>the-pit-seven.vercel.app/join</small>
          </span>
        </a>
      </header>
      <section className="feed-shell feed-open" aria-labelledby="market-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trading floor</p>
            <h2 id="market-heading">Live market</h2>
          </div>
          <p>Order book, trades, and leaderboard, updated live</p>
        </div>
        <MarketBoard />
      </section>
      <section className="feed-shell feed-open" aria-labelledby="alerts-heading">
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
