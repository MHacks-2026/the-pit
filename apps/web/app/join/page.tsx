import JoinForm from './JoinForm';

import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Join() {
  return (
    <main className="screen terminal-join-page">
      <PageHeader />
      <Ticker />
      <section className="feed-shell" aria-labelledby="join-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trader desk</p>
            <h2 id="join-heading">Join the Pit</h2>
          </div>
        </div>
        <JoinForm />
      </section>
    </main>
  );
}
