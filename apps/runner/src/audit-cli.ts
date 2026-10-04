import { DbConnection } from '@the-pit/bindings';
import { verifyChain } from '@the-pit/cop';
import { auditSnapshot, type AuditSnapshot } from './audit';

const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
if (!uri || !database) throw new Error('Set NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB to audit a database.');

const connection = await new Promise<DbConnection>((resolve, reject) => {
  DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database)
    .onConnect(conn => conn.subscriptionBuilder()
      .onApplied(() => resolve(conn))
      .onError(() => reject(new Error('Audit subscription failed')))
      .subscribeToAllTables())
    .onConnectError(() => reject(new Error('Audit connection failed')))
    .build();
});

try {
  const snapshot: AuditSnapshot = {
    accounts: [...connection.db.account.iter()].map(row => ({ owner: row.identity.toHexString(), cash: row.cash })),
    positions: [...connection.db.position.iter()].map(row => ({ owner: row.owner.toHexString(), marketId: row.marketId, qty: row.qty })),
    orders: [...connection.db.order.iter()].map(row => ({ id: Number(row.id), owner: row.owner.toHexString(),
      marketId: row.marketId, side: row.side, price: row.price, qty: row.qty, remaining: row.remaining, status: row.status })),
    trades: [...connection.db.trade.iter()].map(row => ({ id: Number(row.id), marketId: row.marketId, price: row.price, qty: row.qty,
      maker: row.maker.toHexString(), taker: row.taker.toHexString(), makerOrderId: Number(row.makerOrderId), takerOrderId: Number(row.takerOrderId) })),
    events: [...connection.db.eventLog.iter()].map(row => ({ id: Number(row.id), kind: row.kind, marketId: row.marketId, payload: row.payload })),
    alerts: [...connection.db.alert.iter()].map(row => ({ id: Number(row.id), owner: row.owner.toHexString(), kind: row.kind, evidence: row.evidence })),
  };
  const issues = auditSnapshot(snapshot);
  console.info(`Audited ${database}: ${snapshot.accounts.length} accounts, ${snapshot.orders.length} orders, ` +
    `${snapshot.trades.length} trades, ${snapshot.events.length} events, ${snapshot.alerts.length} alerts.`);
  // Tamper-evident record: recompute every SHA-256 link of event_chain against event_log.
  const chain = verifyChain(
    [...connection.db.eventChain.iter()].map(row => ({ seq: Number(row.seq), eventId: Number(row.eventId), marker: row.marker,
      ts: row.ts.microsSinceUnixEpoch.toString(), prevHash: row.prevHash, hash: row.hash })),
    [...connection.db.eventLog.iter()].map(row => ({ id: Number(row.id), kind: row.kind, owner: row.owner.toHexString(),
      marketId: row.marketId, payload: row.payload, ts: row.ts.microsSinceUnixEpoch.toString() })),
  );
  const head = [...connection.db.chainHead.iter()][0];
  console.info(`Market record: ${chain.links} links, head ${chain.headHash?.slice(0, 12) ?? 'none'}…` +
    (chain.unchainedBefore ? `, ${chain.unchainedBefore} events from before the chain existed (not covered)` : '') + '.');
  if (head && chain.headHash !== head.hash) issues.push({ code: 'CHAIN_HEAD', detail: 'chain_head does not match the last link' });
  for (const issue of chain.issues) issues.push({ code: `CHAIN_${issue.code}`, detail: issue.detail });
  if (issues.length) {
    for (const issue of issues.slice(0, 20)) console.error(`${issue.code}: ${issue.detail}`);
    if (issues.length > 20) console.error(`...and ${issues.length - 20} more issues.`);
    process.exitCode = 1;
  } else {
    console.info('Audit passed.');
  }
} finally {
  connection.disconnect();
}
