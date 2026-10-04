import { performance } from 'node:perf_hooks';
import { DbConnection } from '@the-pit/bindings';

const database = process.env.PIT_TEST_DATABASE ?? '';
if (!database || !database.startsWith('pit-it-') || process.env.NEXT_PUBLIC_SPACETIME_DB !== database ||
  process.env.NEXT_PUBLIC_SPACETIME_URI !== 'ws://127.0.0.1:3000') {
  throw new Error('Load test requires a pit-it-* disposable database on ws://127.0.0.1:3000.');
}

const clientCount = 20;
const ordersPerClient = 10;
const clients: DbConnection[] = [];

async function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri('ws://127.0.0.1:3000')
      .withDatabaseName(database)
      .onConnect(conn => conn.subscriptionBuilder()
        .onApplied(() => resolve(conn))
        .onError(() => reject(new Error('Load test subscription failed')))
        .subscribeToAllTables())
      .onConnectError(() => reject(new Error('Load test connection failed')))
      .build();
  });
}

const counts = (conn: DbConnection) => ({
  orders: [...conn.db.order.iter()].length,
  trades: [...conn.db.trade.iter()].length,
  events: [...conn.db.eventLog.iter()].length,
});

try {
  clients.push(...await Promise.all(Array.from({ length: clientCount }, () => connect())));
  await Promise.all(clients.map((conn, index) => conn.reducers.join({ name: `load-${index + 1}` })));
  const before = counts(clients[0]);
  const latencyMs: number[] = [];
  for (let round = 0; round < ordersPerClient; round++) {
    const durations = await Promise.all(clients.map(async conn => {
      const start = performance.now();
      await conn.reducers.placeOrder({ marketId: 1, side: 'buy', price: 2_147_483_647, qty: 1, tif: 'IOC' });
      return performance.now() - start;
    }));
    latencyMs.push(...durations);
  }
  const target = before.orders + clientCount * ordersPerClient;
  const deadline = Date.now() + 10_000;
  while (counts(clients[0]).orders < target) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for load orders in the subscription.');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const after = counts(clients[0]);
  latencyMs.sort((a, b) => a - b);
  const percentile = (fraction: number) => Math.round(latencyMs[Math.ceil(fraction * latencyMs.length) - 1]);
  console.info(`Load test on ${database}: ${clientCount} clients, ${latencyMs.length} IOC orders, five bots active.`);
  console.info(`Reducer latency: p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms, max ${Math.round(latencyMs.at(-1)!)} ms.`);
  console.info(`Table growth: orders +${after.orders - before.orders}, trades +${after.trades - before.trades}, events +${after.events - before.events}.`);
} finally {
  for (const conn of clients) conn.disconnect();
}
