import { expect, it } from 'vitest';
import { DbConnection } from '@the-pit/bindings';

const database = process.env.PIT_TEST_DATABASE;
const adminToken = process.env.ADMIN_TOKEN;

function connect(token?: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri('ws://127.0.0.1:3000')
      .withDatabaseName(database!)
      .withToken(token)
      .onConnect(conn => conn.subscriptionBuilder().onApplied(() => resolve(conn)).subscribeToAllTables())
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

it.skipIf(!database || !adminToken)('registers a distinct bot identity, trades and posts delayed news', async () => {
  const admin = await connect(adminToken);
  const bot = await connect();
  try {
    await admin.reducers.adminRegisterBot({ identity: bot.identity!, name: 'acceptance-bot' });
    const owner = bot.identity!.toHexString();
    await until(() => [...admin.db.account.iter()].some(row => row.identity.toHexString() === owner && row.isBot));
    await bot.reducers.placeOrder({ marketId: 1, side: 'buy', price: 99, qty: 1, tif: 'GTC' });
    await until(() => [...admin.db.order.iter()].some(row => row.owner.toHexString() === owner));
    expect([...admin.db.order.iter()].find(row => row.owner.toHexString() === owner)?.price).toBe(99);
    await admin.reducers.adminPostNews({ marketId: 1, text: 'Delayed acceptance hint' });
    await until(() => [...admin.db.news.iter()].some(row => row.text === 'Delayed acceptance hint'));
    await expect(bot.reducers.adminPostNews({ marketId: 1, text: 'unauthorized hint' })).rejects.toThrow();
    expect([...admin.db.news.iter()].some(row => row.text === 'unauthorized hint')).toBe(false);
  } finally {
    bot.disconnect();
    admin.disconnect();
  }
}, 15_000);
