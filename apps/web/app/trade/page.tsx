import TradePanel from './TradePanel';

import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Trade() {
  return (
    <main className="screen terminal-trade-page">
      <PageHeader subtitle="Buy or sell HACK on the live exchange." />
      <Ticker />
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
