import { performance } from 'node:perf_hooks';
import { DbConnection, tables } from '@the-pit/bindings';

// Subscription benchmark: how much does a phone (and the Big Screen) download on page load, and how long until the
// data arrives, with full-table subscriptions vs the filtered ones in apps/web/lib/subscriptions.ts?
// Seeds history through place_order, marks a cutoff, adds a burst of "recent" trading, then opens fresh connections
// with each page's queries (exactly the query objects the React hooks pass) and measures rows, approximate bytes and
// time from subscribe to applied. Only runs against a disposable pit-bench-* database.
//
//   PIT_BENCH_URI=ws://127.0.0.1:3123 PIT_BENCH_DB=pit-bench-123 node --import tsx src/subscription-bench.ts
//   Optional: PIT_BENCH_SEED_ORDERS=50000 PIT_BENCH_RECENT_ORDERS=600 PIT_BENCH_REPEATS=5

const uri = process.env.PIT_BENCH_URI ?? '';
const database = process.env.PIT_BENCH_DB ?? '';
if (!database.startsWith('pit-bench-') || !/^ws:\/\/127\.0\.0\.1:\d+$/.test(uri)) {
  throw new Error('subscription-bench needs PIT_BENCH_DB=pit-bench-* on a local ws://127.0.0.1:<port> server.');
}
const seedOrders = Number(process.env.PIT_BENCH_SEED_ORDERS ?? 50_000);
const recentOrders = Number(process.env.PIT_BENCH_RECENT_ORDERS ?? 600);
const repeats = Number(process.env.PIT_BENCH_REPEATS ?? 5);

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect(conn => resolve(conn))
      .onConnectError(() => reject(new Error(`connection to ${database} failed`)))
      .build();
  });
}

async function trade(a: DbConnection, b: DbConnection, orders: number) {
  for (let i = 0; i < orders; i += 2) {
    const [seller, buyer] = i % 4 === 0 ? [a, b] : [b, a];
    await seller.reducers.placeOrder({ marketId: 1, side: 'sell', price: 100, qty: 1, tif: 'GTC' });
    await buyer.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 1, tif: 'IOC' });
  }
}

const [a, b] = await Promise.all([connect(), connect()]);
await Promise.all([a.reducers.join({ name: 'sub-bench-a' }), b.reducers.join({ name: 'sub-bench-b' })]);
await trade(a, b, seedOrders);
await new Promise(resolve => setTimeout(resolve, 1_100)); // the cutoff falls strictly between history and the recent burst
const cutoff = new Date();
const { Timestamp } = await import('spacetimedb');
const since = Timestamp.fromDate(cutoff);
await new Promise(resolve => setTimeout(resolve, 1_100));
await trade(a, b, recentOrders);
a.disconnect();
b.disconnect();

// One entry per live connection a page opens (each SpacetimeDBProvider is its own connection).
type Q = unknown[]; // query-builder objects, exactly what useTable passes
const full = { order: tables.order, trade: tables.trade };
const openOrders = tables.order.where(r => r.status.eq('open'));
const recentOrdersQ = tables.order.where(r => r.ts.gte(since));
const recentTrades = tables.trade.where(r => r.ts.gte(since));
const small = [tables.account, tables.position, tables.alert, tables.news];
const pages: Record<string, { before: Q[]; after: Q[] }> = {
  'Phone /trade (Ticker + trade panel)': {
    before: [[full.order, full.trade, ...small], [tables.account, tables.position, full.order, full.trade, tables.alert]],
    after: [[openOrders, recentOrdersQ, recentTrades, ...small], [tables.account, tables.position, openOrders, recentTrades, tables.alert]],
  },
  'Big Screen /screen (Ticker + board + alert feed)': {
    before: [[full.order, full.trade, ...small], [full.order, full.trade, ...small], [tables.alert, tables.account]],
    after: [[openOrders, recentOrdersQ, recentTrades, ...small], [openOrders, recentOrdersQ, recentTrades, ...small], [tables.alert, tables.account]],
  },
};

const json = (row: unknown) => JSON.stringify(row, (_k, v) =>
  typeof v === 'bigint' ? v.toString() : v && typeof v === 'object' && 'toHexString' in v ? (v as { toHexString(): string }).toHexString() : v);

async function load(connections: Q[]) {
  const started = performance.now();
  const results = await Promise.all(connections.map(async queries => {
    const conn = await connect();
    await new Promise<void>((resolve, reject) => {
      conn.subscriptionBuilder().onApplied(() => resolve()).onError(() => reject(new Error('subscription failed'))).subscribe(queries as never);
    });
    let rows = 0;
    let bytes = 0;
    for (const table of [conn.db.order, conn.db.trade, conn.db.account, conn.db.position, conn.db.alert, conn.db.news]) {
      for (const row of table.iter()) { rows++; bytes += json(row).length; }
    }
    conn.disconnect();
    return { rows, bytes };
  }));
  return { ms: performance.now() - started, rows: results.reduce((s, r) => s + r.rows, 0), bytes: results.reduce((s, r) => s + r.bytes, 0) };
}

const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
console.log(JSON.stringify({ seedOrders, recentOrders, cutoff: cutoff.toISOString() }));
for (const [page, { before, after }] of Object.entries(pages)) {
  for (const [label, queries] of [['before', before], ['after', after]] as const) {
    const runs = [];
    for (let i = 0; i < repeats; i++) runs.push(await load(queries));
    console.log(JSON.stringify({ page, label, connections: queries.length, rows: runs[0].rows,
      approxKB: Math.round(runs[0].bytes / 1024), medianMs: Math.round(median(runs.map(r => r.ms)) * 10) / 10 }));
  }
}
