import { expect, it } from 'vitest';
import { DbConnection } from '@the-pit/bindings';

const database = process.env.PIT_TEST_DATABASE;
const runnerActive = process.env.PIT_COP_RUNNER_ACTIVE === 'true';

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri('ws://127.0.0.1:3000')
      .withDatabaseName(database!)
      .onConnect(conn => conn.subscriptionBuilder().onApplied(() => resolve(conn)).subscribeToAllTables())
      .onConnectError(reject)
      .build();
  });
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Cop alert did not appear');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

it.skipIf(!database || !runnerActive)('raises one evidence-backed alert from a live spoof sequence', async () => {
  const spoofer = await connect();
  const other = await connect();
  try {
    await spoofer.reducers.join({ name: 'spoof-acceptance' });
    await other.reducers.join({ name: 'liquidity-acceptance' });
    for (const price of [104, 105, 106]) {
      await spoofer.reducers.placeOrder({ marketId: 1, side: 'sell', price, qty: 40, tif: 'GTC' });
    }
    await other.reducers.placeOrder({ marketId: 1, side: 'sell', price: 100, qty: 1, tif: 'GTC' });
    await spoofer.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 1, tif: 'IOC' });
    await spoofer.reducers.cancelAll({});

    const owner = spoofer.identity!.toHexString();
    await until(() => [...spoofer.db.alert.iter()].some(row => row.owner.toHexString() === owner));
    const alert = [...spoofer.db.alert.iter()].find(row => row.owner.toHexString() === owner)!;
    const evidence = JSON.parse(alert.evidence) as { layerOrderIds: number[]; cancelledQty: number; totalLayeredQty: number; oppositeTradeId: number };
    expect(alert.kind).toBe('spoofing');
    expect(alert.score).toBeGreaterThanOrEqual(70);
    expect(evidence.layerOrderIds).toHaveLength(3);
    expect(evidence.cancelledQty * 5).toBeGreaterThanOrEqual(evidence.totalLayeredQty * 4);
    expect(evidence.oppositeTradeId).toBeGreaterThan(0);
    expect(evidence.layerOrderIds.every(id => spoofer.db.order.id.find(BigInt(id))?.owner.toHexString() === owner)).toBe(true);
    expect(spoofer.db.trade.id.find(BigInt(evidence.oppositeTradeId))?.taker.toHexString()).toBe(owner);
  } finally {
    spoofer.disconnect();
    other.disconnect();
  }
}, 15_000);
