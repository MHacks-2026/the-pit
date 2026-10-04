import AlertFeed from './AlertFeed';
import MarketBoard from './MarketBoard';
import MarketWatchPanel from './MarketWatchPanel';
import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Screen() {
  return (
    <main className="page page-screen">
      <p className="tab">Case file: the live floor</p>
      <div className="sheet">
      <PageHeader subtitle="A live exchange with a Market Cop watching every order." />
      <Ticker />
      <section className="floor" aria-labelledby="market-heading">
        <h2 id="market-heading" className="visually-hidden">Live market</h2>
        <MarketBoard />
      </section>
      <section className="desk desk-cop" aria-labelledby="alerts-heading">
        <header className="desk-head">
          <h2 id="alerts-heading">Market Cop</h2>
          <p>Every alert comes with its evidence.</p>
        </header>
        <AlertFeed />
      </section>
      <section className="desk" aria-labelledby="real-market-heading">
        <header className="desk-head">
          <h2 id="real-market-heading">Live BTC, through the Cop’s eyes</h2>
          <p>Bitstamp’s public order feed, right now.</p>
        </header>
        <MarketWatchPanel />
      </section>
      <footer className="colophon">Markets are only fair if someone is watching.</footer>
      </div>
    </main>
  );
}
