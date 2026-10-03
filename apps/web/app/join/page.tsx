import JoinForm from './JoinForm';

export default function Join() {
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">MHacks 2026 · play money only</p>
          <h1>THE PIT</h1>
          <p className="subtitle">Enter a name and join the living exchange.</p>
        </div>
        <div className="live-pill"><span className="live-dot" /> LIVE MARKET</div>
      </header>
      <section className="feed-shell" aria-labelledby="join-heading">
        <div className="feed-heading">
          <div>
            <p className="eyebrow">Trader desk</p>
            <h2 id="join-heading">Join the pit</h2>
          </div>
          <p>Starting cash: 10,000 play dollars</p>
        </div>
        <JoinForm />
      </section>
      <footer>Markets are only fair if someone is watching.</footer>
    </main>
  );
}
