import { schema, table, t, SenderError } from 'spacetimedb/server';
import { matchOrder } from '@the-pit/engine';

const account = table({ public: true }, {
  identity: t.identity().primaryKey(), name: t.string(), cash: t.i64(),
  isBot: t.bool(), createdAt: t.timestamp(),
});
const market = table({ public: true }, {
  id: t.u32().primaryKey(), symbol: t.string(), kind: t.string(),
  tick: t.u32(), status: t.string(),
});
const order = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(), marketId: t.u32(), owner: t.identity(),
  side: t.string(), price: t.i32(), qty: t.u32(), remaining: t.u32(),
  status: t.string(), ts: t.timestamp(),
});
const trade = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(), marketId: t.u32(), price: t.i32(),
  qty: t.u32(), maker: t.identity(), taker: t.identity(), makerOrderId: t.u64(),
  takerOrderId: t.u64(), ts: t.timestamp(),
});
const position = table({ public: true }, {
  id: t.string().primaryKey(), owner: t.identity(), marketId: t.u32(),
  qty: t.i32(), avgPrice: t.i32(),
});
const eventLog = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(), kind: t.string(), owner: t.identity(),
  marketId: t.u32(), payload: t.string(), ts: t.timestamp(),
});
const alert = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(), owner: t.identity(), kind: t.string(),
  score: t.u32(), evidence: t.string(), narration: t.string().optional(), ts: t.timestamp(),
});
const news = table({ public: true }, {
  id: t.u64().primaryKey().autoInc(), marketId: t.u32(), text: t.string(), ts: t.timestamp(),
});
const adminConfig = table({ name: 'admin_config' }, { ownerIdentity: t.identity().primaryKey() });

const spacetimedb = schema({ account, market, order, trade, position, eventLog, alert, news, adminConfig });
export default spacetimedb;

function requireAdmin(ctx: { db: { adminConfig: { iter: () => Iterator<{ ownerIdentity: { toHexString(): string } }> } }; sender: { toHexString(): string } }): void {
  const admin = ctx.db.adminConfig.iter().next().value;
  if (!admin || admin.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('admin only');
  }
}

export const init = spacetimedb.init(ctx => {
  ctx.db.adminConfig.insert({ ownerIdentity: ctx.sender });
  ctx.db.market.insert({ id: 1, symbol: 'HACK', kind: 'index', tick: 1, status: 'open' });
});

export const join = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 32) throw new SenderError('name must be 1 to 32 characters');
  if (ctx.db.account.identity.find(ctx.sender)) return;
  ctx.db.account.insert({ identity: ctx.sender, name: cleanName, cash: 10_000n, isBot: false, createdAt: ctx.timestamp });
});

export const placeOrder = spacetimedb.reducer(
  { marketId: t.u32(), side: t.string(), price: t.i32(), qty: t.u32(), tif: t.string() },
  (ctx, { marketId, side, price, qty, tif }) => {
    if (side !== 'buy' && side !== 'sell') throw new SenderError('invalid side');
    if (tif !== 'GTC' && tif !== 'IOC') throw new SenderError('invalid time in force');
    const result = matchOrder(
      { orders: [] },
      { marketId, owner: ctx.sender.toHexString(), side, price, qty, tif },
      { now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => 0 }
    );
    throw new SenderError(result.events[0]?.kind === 'rejected' ? result.events[0].reason : 'matching unavailable until T09');
  }
);

export const cancelOrder = spacetimedb.reducer({ orderId: t.u64() }, () => {
  throw new SenderError('cancellation unavailable until T09');
});
export const cancelAll = spacetimedb.reducer(() => {
  throw new SenderError('cancellation unavailable until T09');
});
export const adminSettle = spacetimedb.reducer({ marketId: t.u32(), outcome: t.bool() }, ctx => {
  requireAdmin(ctx);
  throw new SenderError('settlement not implemented');
});
export const adminResetMarket = spacetimedb.reducer({ marketId: t.u32() }, ctx => {
  requireAdmin(ctx);
  throw new SenderError('market reset not implemented');
});
export const adminRegisterBot = spacetimedb.reducer(
  { identity: t.identity(), name: t.string() },
  (ctx, { identity, name }) => {
    requireAdmin(ctx);
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 32) throw new SenderError('name must be 1 to 32 characters');
    const existing = ctx.db.account.identity.find(identity);
    if (existing) ctx.db.account.identity.update({ ...existing, name: cleanName, isBot: true });
    else ctx.db.account.insert({ identity, name: cleanName, cash: 10_000n, isBot: true, createdAt: ctx.timestamp });
  }
);
export const adminRaiseAlert = spacetimedb.reducer(
  { owner: t.identity(), kind: t.string(), score: t.u32(), evidence: t.string(), narration: t.string().optional() },
  ctx => {
    requireAdmin(ctx);
    throw new SenderError('alert publishing unavailable until T21');
  }
);
export const adminPostNews = spacetimedb.reducer({ marketId: t.u32(), text: t.string() }, (ctx, { marketId, text }) => {
  requireAdmin(ctx);
  if (!text.trim()) throw new SenderError('news text required');
  if (!ctx.db.market.id.find(marketId)) throw new SenderError('market not found');
  ctx.db.news.insert({ id: 0n, marketId, text: text.trim(), ts: ctx.timestamp });
});
