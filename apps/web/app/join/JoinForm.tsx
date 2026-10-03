'use client';

import { FormEvent, useState } from 'react';
import { mockPitClient } from '../../lib/pit-client';

export default function JoinForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ name: string; cash: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const submittedName = String(new FormData(event.currentTarget).get('name') ?? name);
    try {
      const account = await mockPitClient.join(submittedName);
      setJoined(account);
    } catch (err) {
      setJoined(null);
      setError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <p className="join-status" role="status">
        Welcome, {joined.name}. Starting cash: {joined.cash.toLocaleString('en-US')} play dollars.
      </p>
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
      <button className="join-button" type="submit" disabled={busy}>Join</button>
    </form>
  );
}
