import { expect, it } from 'vitest';
import { DbConnection } from '../../packages/bindings/src';

const database = process.env.PIT_TEST_DATABASE;

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri('ws://127.0.0.1:3000')
      .withDatabaseName(database!)
      .onConnect((conn) => {
        conn.subscriptionBuilder().onApplied(() => resolve(conn)).subscribeToAllTables();
      })
      .onConnectError(reject)
      .build();
  });
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('subscription did not update');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

it.skipIf(!database)('commits an order, trade, cash, positions and event log atomically', async () => {
  const maker = await connect();
  const taker = await connect();
  try {
    await maker.reducers.join({ name: 'maker' });
    await taker.reducers.join({ name: 'taker' });
    await until(() => [...maker.db.account.iter()].length >= 2);
    const makerHex = maker.identity!.toHexString();
    const takerHex = taker.identity!.toHexString();

    await maker.reducers.placeOrder({ marketId: 1, side: 'sell', price: 100, qty: 2, tif: 'GTC' });
    await until(() => [...maker.db.order.iter()].some(row => row.owner.toHexString() === makerHex && row.status === 'open'));
    const makerOrder = [...maker.db.order.iter()].find(row => row.owner.toHexString() === makerHex)!;
    await taker.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 1, tif: 'GTC' });
    await until(() => [...maker.db.trade.iter()].some(row => row.makerOrderId === makerOrder.id));

    const trade = [...maker.db.trade.iter()].find(row => row.makerOrderId === makerOrder.id)!;
    expect(trade).toMatchObject({ price: 100, qty: 1 });
    expect(maker.db.order.id.find(makerOrder.id)).toMatchObject({ remaining: 1, status: 'open' });
    expect([...maker.db.account.iter()].find(row => row.identity.toHexString() === makerHex)?.cash).toBe(10_100n);
    expect([...maker.db.account.iter()].find(row => row.identity.toHexString() === takerHex)?.cash).toBe(9_900n);
    expect([...maker.db.position.iter()].find(row => row.owner.toHexString() === makerHex)?.qty).toBe(-1);
    expect([...maker.db.position.iter()].find(row => row.owner.toHexString() === takerHex)?.qty).toBe(1);
    expect([...maker.db.eventLog.iter()].filter(row => row.owner.toHexString() === takerHex).map(row => row.kind)).toContain('trade');

    const before = [...maker.db.order.iter()].length;
    await expect(taker.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 51, tif: 'GTC' })).rejects.toThrow();
    expect([...maker.db.order.iter()]).toHaveLength(before);
    await maker.reducers.cancelOrder({ orderId: makerOrder.id });
    await until(() => maker.db.order.id.find(makerOrder.id)?.status === 'cancelled');
    expect(maker.db.order.id.find(makerOrder.id)?.remaining).toBe(1);
    await maker.reducers.placeOrder({ marketId: 1, side: 'sell', price: 101, qty: 2, tif: 'GTC' });
    await until(() => [...maker.db.order.iter()].some(row => row.owner.toHexString() === makerHex && row.price === 101 && row.status === 'open'));
    await maker.reducers.cancelAll();
    await until(() => [...maker.db.order.iter()].every(row => row.owner.toHexString() !== makerHex || row.status !== 'open'));
  } finally {
    maker.disconnect();
    taker.disconnect();
  }
}, 15_000);
