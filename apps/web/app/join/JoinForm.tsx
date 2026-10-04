'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '@the-pit/bindings';
import { LiveProvider } from '../../lib/live';

function JoinInner() {
  const { identity, connectionError } = useSpacetimeDB();
  const [accounts, accountsReady] = useTable(tables.account);
  const join = useReducer(reducers.join);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = identity
    ? accounts.find(account => account.identity.toHexString() === identity.toHexString())
    : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleanName = String(new FormData(event.currentTarget).get('name') ?? name).trim();
    if (!cleanName || cleanName.length > 32) {
      setError('name must be 1 to 32 characters');
      return;
    }
    setBusy(true);
    try {
      await join({ name: cleanName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  if (connectionError) {
    return <p className="join-error" role="alert">Could not reach the exchange. Check your connection and refresh.</p>;
  }
  if (!identity || !accountsReady) {
    return <p className="feed-state" role="status">Connecting to the exchange…</p>;
  }

  if (me) {
    return (
      <div className="join-success">
        <p className="join-status" role="status">
          Welcome, {me.name}. Starting cash: {Number(me.cash).toLocaleString('en-US')} play dollars.
        </p>
        <Link className="join-button" href="/trade">Start trading</Link>
      </div>
    );
  }

  return (
    <form className="join-form" onSubmit={onSubmit}>
      <label className="join-label" htmlFor="trader-name">Display name</label>
      <input
        id="trader-name"
        className="join-input"
        name="name"
        autoComplete="nickname"
        maxLength={32}
        value={name}
        onChange={event => setName(event.target.value)}
      />
      <p className="join-hint">Starting cash is 10,000 play dollars.</p>
      {error ? <p className="join-error" role="alert">{error}</p> : null}
      <button className="join-button" type="submit" disabled={busy}>Join the pit</button>
      <ul className="join-perks">
        <li>10,000 play dollars to start</li>
        <li>Trade live against AI bots</li>
        <li>A Market Cop watches every order</li>
      </ul>
    </form>
  );
}

export default function JoinForm() {
  return (
    <LiveProvider>
      <JoinInner />
    </LiveProvider>
  );
}
