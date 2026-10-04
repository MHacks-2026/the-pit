'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';
import { liveConnectionBuilder } from '../../lib/live';
import TraderBadge from '../TraderBadge';

type AlertRow = { id: bigint; kind: string; score: number; evidence: string; narration?: string; owner: { toHexString(): string } };

/** Asks /api/narrate once per new alert that has no stored narration (T22). Falls back silently on any error. */
function useNarrations(alerts: AlertRow[], names: Map<string, string>) {
  const [narrations, setNarrations] = useState(new Map<string, string>());
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const alert of alerts) {
      const id = alert.id.toString();
      if (alert.narration || requested.current.has(id)) continue;
      requested.current.add(id);
      let evidence: unknown = null;
      try { evidence = JSON.parse(alert.evidence); } catch { /* narrator handles missing evidence */ }
      fetch('/api/narrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alert: { kind: alert.kind, score: alert.score, trader: names.get(alert.owner.toHexString()) ?? '', evidence } }),
      })
        .then(response => (response.ok ? response.json() : null))
        .then((result: { text?: string } | null) => {
          if (result?.text) setNarrations(previous => new Map(previous).set(id, result.text!));
        })
        .catch(() => { /* keep the evidence summary */ });
    }
  }, [alerts, names]);
  return narrations;
}

/** The newest link of the tamper-evident market record (one row), so the room can see the record being sealed. */
function RecordSeal() {
  const [heads] = useTable(tables.chainHead);
  const head = heads[0];
  if (!head) return null;
  return <p className="seal" title={`Latest SHA-256 link: ${head.hash}`}>
    <b>Record sealed</b> {Number(head.seq).toLocaleString('en-US')} events, latest link <code>{head.hash.slice(0, 8)}…{head.hash.slice(-4)}</code>.
    Editing or deleting any past event breaks every later link.
  </p>;
}

function FeedContent() {
  const { connectionError } = useSpacetimeDB();
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const bots = new Map(accounts.map(account => [account.identity.toHexString(), account.isBot]));
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 12);
  const narrations = useNarrations(latest, names);

  // The one orchestrated moment: when a new alert lands, police tape sweeps across the top of the screen.
  // Alerts that were already there when the page loaded are treated as seen, so reloading never replays it.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState(new Set<string>());
  const [sweep, setSweep] = useState(0);
  useEffect(() => {
    if (!alertsReady) return;
    const ids = alerts.map(alert => alert.id.toString());
    if (!seen.current) { seen.current = new Set(ids); return; }
    const arrived = ids.filter(id => !seen.current!.has(id));
    if (!arrived.length) return;
    for (const id of arrived) seen.current.add(id);
    setFresh(previous => new Set([...previous, ...arrived]));
    setSweep(n => n + 1);
  }, [alerts, alertsReady]);

  if (connectionError) return <p className="state" role="alert">The live alert feed is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  if (!alertsReady) return <p className="state" role="status">Connecting to the live alert feed…</p>;
  const tape = sweep ? <div key={sweep} className="cop-sweep" aria-hidden="true" /> : null;
  if (!latest.length) return <>
    {tape}
    <p className="state" role="status">No alerts yet. The Cop is watching every order.</p>
    <RecordSeal />
  </>;

  return <>{tape}<ol className="citations" aria-live="polite">
    {latest.map(alert => {
      let detail = 'Structured evidence recorded.';
      try {
        const evidence = JSON.parse(alert.evidence) as { layerOrderIds?: number[]; cancelledQty?: number; totalLayeredQty?: number; oppositeTradeId?: number };
        if (evidence.layerOrderIds && evidence.cancelledQty !== undefined && evidence.totalLayeredQty !== undefined) {
          detail = `${evidence.layerOrderIds.length} layered orders · ${evidence.cancelledQty}/${evidence.totalLayeredQty} units cancelled · opposite trade #${evidence.oppositeTradeId}`;
        }
      } catch { /* keep the generic evidence label */ }
      const id = alert.id.toString();
      const owner = alert.owner.toHexString();
      const name = names.get(owner) || `Trader ${owner.slice(0, 8)}`;
      const kind = alert.kind.replaceAll('_', ' ');
      return <li className={fresh.has(id) ? 'citation citation-new' : 'citation'} key={id}>
        <p className="citation-kind">{kind.charAt(0).toUpperCase() + kind.slice(1)}</p>
        <p className="citation-score"><b>{alert.score}</b>/100</p>
        <h3 className="citation-who"><TraderBadge name={name} isBot={bots.get(owner) ?? false} /> {name}</h3>
        <p className="citation-text">{alert.narration || narrations.get(id) || detail}</p>
        <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
          {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}
        </time>
      </li>;
    })}
  </ol>
  <RecordSeal /></>;
}

export default function AlertFeed() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? liveConnectionBuilder(uri, database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="state" role="alert">The live alert feed is not configured. Set a public wss:// NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB in Vercel, then redeploy.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
