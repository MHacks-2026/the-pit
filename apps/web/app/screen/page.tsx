import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';
import MarketWatchPanel from './MarketWatchPanel';

import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Screen() {
  return (
    <main className="screen">
      <PageHeader subtitle="A living exchange. A watchful Market Cop." />
      <Ticker />
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
      <section className="feed-shell feed-open" aria-labelledby="real-market-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Real market</p>
            <h2 id="real-market-heading">The Cop’s eyes on live BTC</h2>
          </div>
          <p>Real order flow from Bitstamp’s public feed, right now</p>
        </div>
        <MarketWatchPanel />
      </section>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
