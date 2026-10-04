import { performance } from 'node:perf_hooks';
import { DbConnection } from '@the-pit/bindings';

// History benchmark: how does place_order latency change as the exchange accumulates history?
// Builds history through the real place_order reducer (two accounts trading 1 unit back and forth at 100,
// inside every risk limit), pausing at checkpoints to time sequential calls. Subscribes to nothing, so client
// caching never affects the timings. Only runs against a disposable pit-bench-* database.
//
//   PIT_BENCH_URI=ws://127.0.0.1:3123 PIT_BENCH_DB=pit-bench-123 node --import tsx src/history-bench.ts
//   Optional: PIT_BENCH_CHECKPOINTS=0,10000,25000,50000 (historical orders)  PIT_BENCH_SAMPLES=200

const uri = process.env.PIT_BENCH_URI ?? '';
const database = process.env.PIT_BENCH_DB ?? '';
if (!database.startsWith('pit-bench-') || !/^ws:\/\/127\.0\.0\.1:\d+$/.test(uri)) {
  throw new Error('history-bench needs PIT_BENCH_DB=pit-bench-* on a local ws://127.0.0.1:<port> server.');
}
const checkpoints = (process.env.PIT_BENCH_CHECKPOINTS ?? '0,10000,25000,50000').split(',').map(Number);
const samples = Number(process.env.PIT_BENCH_SAMPLES ?? 200);
const startOrders = Number(process.env.PIT_BENCH_START_ORDERS ?? 0); // history already present (e.g. after an upgrade)
if (!checkpoints.every(Number.isSafeInteger) || !Number.isSafeInteger(samples) || samples < 2 || samples % 2) {
  throw new Error('PIT_BENCH_CHECKPOINTS must be integers and PIT_BENCH_SAMPLES an even integer >= 2.');
}

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect(conn => resolve(conn))
      .onConnectError(() => reject(new Error(`connection to ${database} failed`)))
      .build();
  });
}

const [seedA, seedB, measureA, measureB] = await Promise.all([connect(), connect(), connect(), connect()]);
const all = [seedA, seedB, measureA, measureB];
await Promise.all(all.map((conn, i) => conn.reducers.join({ name: `bench-${i + 1}` })));

/** One round = two orders: `seller` rests 1 @ 100, `buyer` takes it with an IOC. Both stay flat over two rounds. */
async function round(seller: DbConnection, buyer: DbConnection, timings?: number[]): Promise<void> {
  for (const [conn, side, tif] of [[seller, 'sell', 'GTC'], [buyer, 'buy', 'IOC']] as const) {
    const start = performance.now();
    await conn.reducers.placeOrder({ marketId: 1, side, price: 100, qty: 1, tif });
    timings?.push(performance.now() - start);
  }
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
let orders = startOrders;
let flip = false;
let measureFlip = false;
const seedStarted = performance.now();
try {
  for (const checkpoint of checkpoints) {
    const segmentStart = performance.now();
    const segmentOrders = Math.max(0, checkpoint - orders);
    while (orders < checkpoint) {
      await (flip ? round(seedB, seedA) : round(seedA, seedB));
      flip = !flip;
      orders += 2;
    }
    const seedSeconds = (performance.now() - segmentStart) / 1000;
    const timings: number[] = [];
    for (let i = 0; i < samples / 2; i++) {
      await (measureFlip ? round(measureB, measureA, timings) : round(measureA, measureB, timings));
      measureFlip = !measureFlip;
    }
    orders += samples;
    const sorted = [...timings].sort((a, b) => a - b);
    const ms = (x: number) => Math.round(x * 10) / 10;
    console.log(JSON.stringify({
      historicalOrders: checkpoint, samples: sorted.length,
      p50: ms(percentile(sorted, 0.5)), p95: ms(percentile(sorted, 0.95)), max: ms(sorted.at(-1)!),
      mean: ms(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      seedOrdersPerSecond: segmentOrders ? Math.round(segmentOrders / seedSeconds) : null,
    }));
  }
  console.log(JSON.stringify({ done: true, totalOrdersPlaced: orders - startOrders, totalSeconds: Math.round((performance.now() - seedStarted) / 1000) }));
} finally {
  for (const conn of all) conn.disconnect();
}
