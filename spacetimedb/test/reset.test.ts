import { expect, it } from 'vitest';
import { DbConnection } from '../../packages/bindings/src';

const database = process.env.PIT_TEST_DATABASE;
const adminToken = process.env.ADMIN_TOKEN;

function connect(token?: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri('ws://127.0.0.1:3000')
      .withDatabaseName(database!)
      .withToken(token)
      .onConnect(conn => {
        conn.subscriptionBuilder().onApplied(() => resolve(conn)).subscribeToAllTables();
      })
      .onConnectError(reject)
      .build();
  });
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

const count = (rows: Iterable<unknown>) => [...rows].length;

it.skipIf(!database || !adminToken)('admin_reset_market clears trading history and players, then trading works again', async () => {
  const admin = await connect(adminToken);
  const maker = await connect();
  const taker = await connect();
  try {
    await maker.reducers.join({ name: 'reset-maker' });
    await taker.reducers.join({ name: 'reset-taker' });
    await maker.reducers.placeOrder({ marketId: 1, side: 'sell', price: 100, qty: 2, tif: 'GTC' });
    await taker.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 1, tif: 'IOC' });
    await until(() => count(admin.db.trade.iter()) > 0 && count(admin.db.position.iter()) > 0, 'a trade before reset');

    await expect(maker.reducers.adminResetMarket({ marketId: 1 })).rejects.toThrow(/admin only/);
    await admin.reducers.adminResetMarket({ marketId: 1 });
    await until(() => count(admin.db.trade.iter()) === 0 && count(admin.db.order.iter()) === 0 &&
      count(admin.db.position.iter()) === 0 && count(admin.db.eventLog.iter()) === 0, 'trading tables empty');
    expect(count(admin.db.alert.iter())).toBe(0);
    expect(count(admin.db.news.iter())).toBe(0);
    expect([...admin.db.account.iter()].filter(a => !a.isBot)).toEqual([]);
    expect([...admin.db.account.iter()].every(a => a.cash === 10_000n)).toBe(true);

    // Players rejoin and the market works from a clean slate.
    await maker.reducers.join({ name: 'reset-maker' });
    await taker.reducers.join({ name: 'reset-taker' });
    await maker.reducers.placeOrder({ marketId: 1, side: 'sell', price: 100, qty: 1, tif: 'GTC' });
    await taker.reducers.placeOrder({ marketId: 1, side: 'buy', price: 100, qty: 1, tif: 'IOC' });
    await until(() => count(admin.db.trade.iter()) === 1, 'one trade after reset');
    const takerAccount = admin.db.account.identity.find(taker.identity!)!;
    expect(takerAccount.cash).toBe(9_900n);
  } finally {
    admin.disconnect();
    maker.disconnect();
    taker.disconnect();
  }
}, 20_000);
