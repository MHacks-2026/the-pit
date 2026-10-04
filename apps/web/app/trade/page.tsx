import PageHeader from '../PageHeader';
import Ticker from '../Ticker';
import TradePanel from './TradePanel';

export default function Trade() {
  return (
    <main className="page page-phone">
      <p className="tab">Case file: your trading desk</p>
      <div className="sheet">
      <PageHeader subtitle="Buy and sell HACK with play money." />
      <Ticker />
      <section className="desk" aria-labelledby="trade-heading">
        <h2 id="trade-heading" className="visually-hidden">Trade HACK</h2>
        <TradePanel />
      </section>
      <footer className="colophon">Markets are only fair if someone is watching.</footer>
      </div>
    </main>
  );
}
