import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';

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
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
