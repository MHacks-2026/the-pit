'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import { groupAlertCases } from '../../lib/alertCases';

type AlertRow = { id: bigint; kind: string; score: number; evidence: string; narration?: string;
  ts: { microsSinceUnixEpoch: bigint }; owner: { toHexString(): string } };

function evidenceSummary(raw: string): string {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(value.layerOrderIds) && typeof value.cancelledQty === 'number' &&
      typeof value.totalLayeredQty === 'number') {
      return `${value.layerOrderIds.length} layered orders · ${value.cancelledQty}/${value.totalLayeredQty} units cancelled`;
    }
  } catch { /* Older evidence can still be inspected below. */ }
  return 'Recorded event evidence available below.';
}

function EvidenceFacts({ raw }: { raw: string }) {
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; }
  catch { return <p>Evidence could not be parsed. The recorded payload is available below.</p>; }
  const orderIds = Array.isArray(value.layerOrderIds) ? value.layerOrderIds.filter(id => typeof id === 'number') : [];
  const cancelledIds = Array.isArray(value.cancelledOrderIds) ? value.cancelledOrderIds.filter(id => typeof id === 'number') : [];
  return <dl className="alert-facts">
    {orderIds.length > 0 && <><dt>Layer orders</dt><dd>{orderIds.map(id => `#${id}`).join(', ')}</dd></>}
    {typeof value.oppositeTradeId === 'number' && <><dt>Opposite trade</dt><dd>#{value.oppositeTradeId}</dd></>}
    {cancelledIds.length > 0 && <><dt>Cancelled orders</dt><dd>{cancelledIds.map(id => `#${id}`).join(', ')}</dd></>}
    {typeof value.cancelledQty === 'number' && typeof value.totalLayeredQty === 'number' &&
      <><dt>Cancelled quantity</dt><dd>{value.cancelledQty} of {value.totalLayeredQty}</dd></>}
  </dl>;
}

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

/** The newest link of the tamper-evident market record (one row). */
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
  const cases = groupAlertCases(latest.map(alert => ({ id: alert.id.toString(),
    owner: alert.owner.toHexString(), kind: alert.kind,
    at: Number(alert.ts.microsSinceUnixEpoch / 1000n), alert })));
  const narrations = useNarrations(latest, names);

  if (connectionError) return <p className="feed-state" role="alert">The live alert feed is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  if (!alertsReady) return <p className="feed-state" role="status">Connecting to the live alert feed…</p>;
  if (!latest.length) return <>
    <p className="feed-state" role="status">No alerts yet. The Market Cop is watching the order stream.</p>
    <RecordSeal />
  </>;

  return <>
    <p className="alert-disclaimer">Pattern matches for review. A rule score measures how closely an event matched the rule, not the probability of manipulation.</p>
    <ol className="alert-list" aria-live="polite">
      {cases.map(item => {
        const newest = item.entries[0].alert;
        return <li className="alert-card" key={`${item.owner}:${item.kind}:${newest.id}`}>
          <div className="alert-topline"><span className="alert-kind">Suspected {item.kind.replaceAll('_', ' ')}</span>
            <span className="alert-score">Rule match</span></div>
          <h3>{names.get(item.owner) || `Trader ${item.owner.slice(0, 8)}`}</h3>
          <p>{item.entries.length} recent finding{item.entries.length === 1 ? '' : 's'} shown · {evidenceSummary(newest.evidence)}</p>
          <time dateTime={new Date(item.latestAt).toISOString()}>{new Date(item.latestAt).toLocaleTimeString()}</time>
          <details className="alert-evidence">
            <summary>Inspect {item.entries.length === 1 ? 'evidence' : `${item.entries.length} findings`}</summary>
            <ol>
              {item.entries.map(({ alert }) => <li key={alert.id.toString()}>
                <strong>Finding #{alert.id.toString()}</strong> · <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
                  {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}</time>
                <p>{alert.narration || narrations.get(alert.id.toString()) || evidenceSummary(alert.evidence)}</p>
                <p>Rule score: {alert.score}/100. This is not a calibrated confidence estimate.</p>
                <EvidenceFacts raw={alert.evidence} />
                <details><summary>Recorded evidence JSON</summary><pre>{alert.evidence}</pre></details>
              </li>)}
            </ol>
          </details>
        </li>;
      })}
    </ol>
    <RecordSeal />
  </>;
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
