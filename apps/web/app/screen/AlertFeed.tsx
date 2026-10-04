'use client';

import { useMemo, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import { groupAlertCases } from '../../lib/alertCases';

type AlertRow = { id: bigint; kind: string; evidence: string; ts: { microsSinceUnixEpoch: bigint };
  owner: { toHexString(): string } };

type SpoofEvidence = {
  layerSide?: 'buy' | 'sell';
  layerOrderIds?: number[];
  layerPrices?: number[];
  oppositeTradeId?: number;
  cancelledOrderIds?: number[];
  cancelledQty?: number;
  totalLayeredQty?: number;
};

function readEvidence(raw: string): SpoofEvidence | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SpoofEvidence : null;
  } catch { return null; }
}

function sequence(raw: string): string {
  const evidence = readEvidence(raw);
  if (!evidence || !Array.isArray(evidence.layerOrderIds) ||
    typeof evidence.cancelledQty !== 'number' || typeof evidence.totalLayeredQty !== 'number') {
    return 'Evidence recorded';
  }
  const side = evidence.layerSide === 'buy' || evidence.layerSide === 'sell' ? evidence.layerSide : '';
  const opposite = side === 'buy' ? 'sell' : side === 'sell' ? 'buy' : '';
  return `${evidence.layerOrderIds.length} ${side ? side + ' ' : ''}orders → ${opposite ? opposite + ' ' : ''}trade → ${evidence.cancelledQty}/${evidence.totalLayeredQty} units cancelled`;
}

function EvidenceFacts({ raw }: { raw: string }) {
  const evidence = readEvidence(raw);
  if (!evidence) return <p>Structured evidence unavailable for this finding.</p>;
  const orderIds = Array.isArray(evidence.layerOrderIds) ? evidence.layerOrderIds : [];
  const cancelledIds = Array.isArray(evidence.cancelledOrderIds) ? evidence.cancelledOrderIds : [];
  return <dl className="cop-facts">
    {orderIds.length > 0 && <><dt>Layer orders</dt><dd>{orderIds.map(id => `#${id}`).join(', ')}</dd></>}
    {Array.isArray(evidence.layerPrices) && evidence.layerPrices.length > 0 &&
      <><dt>Prices</dt><dd>{[...new Set(evidence.layerPrices)].join(', ')} ticks</dd></>}
    {typeof evidence.oppositeTradeId === 'number' && <><dt>Opposite trade</dt><dd>#{evidence.oppositeTradeId}</dd></>}
    {cancelledIds.length > 0 && <><dt>Cancelled orders</dt><dd>{cancelledIds.map(id => `#${id}`).join(', ')}</dd></>}
    {typeof evidence.cancelledQty === 'number' && typeof evidence.totalLayeredQty === 'number' &&
      <><dt>Cancelled quantity</dt><dd>{evidence.cancelledQty} of {evidence.totalLayeredQty}</dd></>}
  </dl>;
}

function RecordSeal() {
  const [heads] = useTable(tables.chainHead);
  const head = heads[0];
  if (!head) return null;
  return <p className="cop-seal" title={`Latest SHA-256 link: ${head.hash}`}>
    Record sealed · {Number(head.seq).toLocaleString('en-US')} linked events · {head.hash.slice(0, 8)}…
  </p>;
}

function FeedContent() {
  const { connectionError } = useSpacetimeDB();
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 24);
  const cases = groupAlertCases(latest.map(alert => ({ id: alert.id.toString(),
    owner: alert.owner.toHexString(), kind: alert.kind,
    at: Number(alert.ts.microsSinceUnixEpoch / 1000n), alert: alert as AlertRow })));
  const selected = cases.find(item => item.entries.some(entry => entry.id === selectedId)) ?? cases[0];

  if (connectionError) return <p className="feed-state" role="alert">Live alert feed unavailable.</p>;
  if (!alertsReady) return <p className="feed-state" role="status">Connecting to live alerts…</p>;
  if (!selected) return <><p className="feed-state" role="status">No alerts yet. The Market Cop is watching.</p><RecordSeal /></>;

  const newest = selected.entries[0].alert;
  const ownerName = names.get(selected.owner) || `Trader ${selected.owner.slice(0, 8)}`;
  const caseLabel = `Suspected ${selected.kind.replaceAll('_', ' ')}`;
  return <>
    <div className="cop-dashboard">
      <article className="cop-focus" aria-live="polite">
        <div className="cop-focus-top"><span className="cop-pattern">{caseLabel}</span>
          <time dateTime={new Date(selected.latestAt).toISOString()}>{new Date(selected.latestAt).toLocaleTimeString()}</time></div>
        <h3>{ownerName}</h3>
        <p className="cop-sequence">{sequence(newest.evidence)}</p>
        <p className="cop-count">{selected.entries.length} finding{selected.entries.length === 1 ? '' : 's'} shown · Pattern match, not proof of intent</p>
        <details className="cop-evidence">
          <summary>View evidence</summary>
          <ol tabIndex={0} aria-label="Finding evidence">
            {selected.entries.map(({ alert }) => <li key={alert.id.toString()}>
              <div className="cop-finding-head"><strong>Finding #{alert.id.toString()}</strong>
                <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
                  {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}</time></div>
              <p>{sequence(alert.evidence)}</p>
              <EvidenceFacts raw={alert.evidence} />
            </li>)}
          </ol>
        </details>
      </article>
      <aside className="cop-recent" aria-label="Recent alert cases">
        <div className="cop-recent-head"><h3>Recent</h3>
          {selected !== cases[0] && <button type="button" onClick={() => setSelectedId(null)}>Latest</button>}</div>
        <ol>
          {cases.slice(0, 5).map(item => {
            const name = names.get(item.owner) || `Trader ${item.owner.slice(0, 8)}`;
            return <li key={item.entries[0].id}><button type="button"
              aria-pressed={selected === item} onClick={() => setSelectedId(item.entries[0].id)}>
              <span><strong>{name}</strong><small>{item.kind.replaceAll('_', ' ')} · {item.entries.length} finding{item.entries.length === 1 ? '' : 's'}</small></span>
              <time dateTime={new Date(item.latestAt).toISOString()}>{new Date(item.latestAt).toLocaleTimeString()}</time>
            </button></li>;
          })}
        </ol>
      </aside>
    </div>
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
    return <p className="feed-state" role="alert">The live alert feed is not configured.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
