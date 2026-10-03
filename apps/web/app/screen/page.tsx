import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';

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
      <section className="feed-shell" aria-labelledby="market-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trading floor</p>
            <h2 id="market-heading">Live market</h2>
          </div>
          <p>Order book, trades and leaderboard, updated live</p>
        </div>
        <MarketBoard />
      </section>
      <section className="feed-shell" aria-labelledby="join-heading">
        <div className="join-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="join-qr" src="/join-qr.svg" alt="QR code for the-pit-seven.vercel.app/join" width={200} height={200} />
          <div>
            <p className="eyebrow">Your turn</p>
            <h2 id="join-heading">Scan to trade</h2>
            <p className="board-sub">Point your phone camera at the code, pick a name and start with 10,000 play dollars.</p>
            <p className="board-sub">the-pit-seven.vercel.app/join</p>
          </div>
        </div>
      </section>
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
