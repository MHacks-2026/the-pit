import { DbConnection } from '@the-pit/bindings';
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
