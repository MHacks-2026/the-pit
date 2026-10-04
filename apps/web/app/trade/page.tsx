import TradePanel from './TradePanel';

import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Trade() {
  return (
    <main className="screen terminal-trade-page">
      <PageHeader />
      <Ticker />
      <section className="feed-shell" aria-labelledby="trade-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trader desk</p>
            <h2 id="trade-heading">Trade HACK</h2>
          </div>
        </div>
        <TradePanel />
      </section>
    </main>
  );
}
