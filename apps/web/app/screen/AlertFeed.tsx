'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';

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
  return <p className="board-sub" title={`Latest SHA-256 link: ${head.hash}`}>
    Market record sealed: {Number(head.seq).toLocaleString('en-US')} linked events · head <code>{head.hash.slice(0, 8)}…{head.hash.slice(-4)}</code>.
    Editing or deleting any past event breaks every later link.
  </p>;
}

function FeedContent() {
  const { connectionError } = useSpacetimeDB();
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 12);
  const narrations = useNarrations(latest, names);

  if (connectionError) return <p className="feed-state" role="alert">The live alert feed is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  if (!alertsReady) return <p className="feed-state" role="status">Connecting to the live alert feed…</p>;
  if (!latest.length) return <>
    <p className="feed-state" role="status">No alerts yet. The Market Cop is watching the order stream.</p>
    <RecordSeal />
  </>;

  return <><ol className="alert-list" aria-live="polite">
    {latest.map(alert => {
      let detail = 'Structured evidence recorded.';
      try {
        const evidence = JSON.parse(alert.evidence) as { layerOrderIds?: number[]; cancelledQty?: number; totalLayeredQty?: number; oppositeTradeId?: number };
        if (evidence.layerOrderIds && evidence.cancelledQty !== undefined && evidence.totalLayeredQty !== undefined) {
          detail = `${evidence.layerOrderIds.length} layered orders · ${evidence.cancelledQty}/${evidence.totalLayeredQty} units cancelled · opposite trade #${evidence.oppositeTradeId}`;
        }
      } catch { /* keep the generic evidence label */ }
      return <li className="alert-card" key={alert.id.toString()}>
        <div className="alert-topline"><span className="alert-kind">{alert.kind.replaceAll('_', ' ')}</span><span className="alert-score">{alert.score}/100</span></div>
        <h3>{names.get(alert.owner.toHexString()) || `Trader ${alert.owner.toHexString().slice(0, 8)}`}</h3>
        <p>{alert.narration || narrations.get(alert.id.toString()) || detail}</p>
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
  const connectionBuilder = useMemo(() => validUri && database ? DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="feed-state" role="alert">The live alert feed is not configured. Set a public wss:// NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB in Vercel, then redeploy.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
