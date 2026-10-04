import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';
import MarketWatchPanel from './MarketWatchPanel';
import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Screen() {
  return (
    <main className="screen terminal-screen">
      <PageHeader />
      <Ticker />
      <div className="terminal-dashboard">
        <MarketBoard />
        <section className="terminal-cop" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" className="terminal-pane-title">Market Cop</h2>
          <AlertFeed />
        </section>
        <section className="terminal-btc" aria-labelledby="real-market-heading">
          <h2 id="real-market-heading" className="terminal-pane-title">BTC/USD</h2>
          <MarketWatchPanel />
        </section>
      </div>
    </main>
  );
}
