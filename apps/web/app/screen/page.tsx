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
          <div className="join-qr-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="join-qr" src="/join-qr.svg" alt="QR code for the-pit-seven.vercel.app/join" width={220} height={220} />
          </div>
          <div className="join-copy">
            <p className="eyebrow">Your turn</p>
            <h2 id="join-heading">Scan to trade</h2>
            <p className="join-lede">Join the live exchange in seconds. Beat the bots, and see if you can fool the Market Cop.</p>
            <ol className="join-steps">
              <li><span>1</span>Point your phone camera at the code</li>
              <li><span>2</span>Pick a name</li>
              <li><span>3</span>Trade with 10,000 play dollars</li>
            </ol>
            <p className="join-url">the-pit-seven.vercel.app/join</p>
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
