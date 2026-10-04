import JoinForm from './JoinForm';
import PageHeader from '../PageHeader';
import Ticker from '../Ticker';

export default function Join() {
  return (
    <main className="page page-phone">
      <PageHeader subtitle="Pick a name to start trading." />
      <Ticker />
      <section className="desk" aria-labelledby="join-heading">
        <header className="desk-head">
          <h2 id="join-heading">Join the Pit</h2>
          <p>You start with 10,000 play dollars.</p>
        </header>
        <JoinForm />
      </section>
      <footer className="colophon">Markets are only fair if someone is watching.</footer>
    </main>
  );
}
