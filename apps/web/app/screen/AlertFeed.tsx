'use client';

import { useMemo } from 'react';
import { SpacetimeDBProvider, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';

function FeedContent() {
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 12);

  if (!alertsReady) return <p className="feed-state" role="status">Connecting to the live alert feed…</p>;
  if (!latest.length) return <p className="feed-state" role="status">No alerts yet. The Market Cop is watching the order stream.</p>;

  return <ol className="alert-list" aria-live="polite">
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
        <p>{alert.narration || detail}</p>
        <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
          {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}
        </time>
      </li>;
    })}
  </ol>;
}

export default function AlertFeed() {
  const connectionBuilder = useMemo(() => DbConnection.builder()
    .withUri(process.env.NEXT_PUBLIC_SPACETIME_URI || 'ws://127.0.0.1:3000')
    .withDatabaseName(process.env.NEXT_PUBLIC_SPACETIME_DB || 'the-pit-local'), []);
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
