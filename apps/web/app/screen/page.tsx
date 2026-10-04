import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';
import MarketWatchPanel from './MarketWatchPanel';
import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Screen() {
  return (
    <main className="screen terminal-screen">
      <PageHeader subtitle="Live play-money exchange and market surveillance." />
      <Ticker />
      <div className="terminal-dashboard">
        <MarketBoard />
        <section className="terminal-cop" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" className="terminal-pane-title">Market Cop <span>Suspicious patterns</span></h2>
          <AlertFeed />
        </section>
        <section className="terminal-btc" aria-labelledby="real-market-heading">
          <h2 id="real-market-heading" className="terminal-pane-title">BTC/USD <span>Public Bitstamp feed</span></h2>
          <MarketWatchPanel />
        </section>
      </div>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
