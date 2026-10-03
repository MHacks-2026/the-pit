import { schema, table, t, SenderError, type ReducerCtx } from 'spacetimedb/server';
import { matchOrder, cancelOrder as cancelBookOrder, type Book, type MatchResult } from '@the-pit/engine';

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
const idCounter = table({ name: 'id_counter' }, { id: t.u32().primaryKey(), nextId: t.u64() });

const spacetimedb = schema({ account, market, order, trade, position, eventLog, alert, news, adminConfig, idCounter });
export default spacetimedb;

type ModuleCtx = ReducerCtx<typeof spacetimedb.schemaType>;

function requireAdmin(ctx: ModuleCtx): void {
  const admin = ctx.db.adminConfig.iter().next().value;
  if (!admin || admin.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('admin only');
  }
}

function loadBook(ctx: ModuleCtx): Book {
  const accounts: Book['accounts'] = {};
  for (const row of ctx.db.account.iter()) accounts[row.identity.toHexString()] = { cash: Number(row.cash), positions: {} };
  for (const row of ctx.db.position.iter()) {
    const owner = row.owner.toHexString();
    if (accounts[owner]) accounts[owner].positions[row.marketId] = { qty: row.qty, avgPrice: row.avgPrice };
  }
  const orders: Book['orders'] = [];
  for (const row of ctx.db.order.iter()) {
    if (row.status !== 'open' || row.remaining === 0) continue;
    orders.push({
      id: Number(row.id), marketId: row.marketId, owner: row.owner.toHexString(),
      side: row.side as 'buy' | 'sell', price: row.price, qty: row.qty,
      remaining: row.remaining, status: 'open', tif: 'GTC',
      ts: Number(row.ts.microsSinceUnixEpoch / 1000n),
    });
  }
  const lastTradePrice: Book['lastTradePrice'] = {};
  const lastTradeTime: Record<number, bigint> = {};
  for (const row of ctx.db.trade.iter()) {
    const time = row.ts.microsSinceUnixEpoch;
    if (lastTradeTime[row.marketId] === undefined || time >= lastTradeTime[row.marketId]) {
      lastTradeTime[row.marketId] = time;
      lastTradePrice[row.marketId] = row.price;
    }
  }
  return { orders, accounts, lastTradePrice };
}

function allocate(counter: { value: bigint }): number {
  const id = Number(counter.value);
  if (!Number.isSafeInteger(id)) throw new SenderError('ID range exhausted');
  counter.value += 1n;
  return id;
}

function persistResult(ctx: ModuleCtx, result: MatchResult, counter: { value: bigint }): void {
  const failure = result.events.find(event => event.kind === 'rejected');
  if (failure?.kind === 'rejected') throw new SenderError(failure.reason);
  const identityByHex = new Map([...ctx.db.account.iter()].map(row => [row.identity.toHexString(), row.identity]));
  const identity = (hex: string) => {
    const value = identityByHex.get(hex);
    if (!value) throw new SenderError('account identity missing');
    return value;
  };
  for (const row of result.book.orders) {
    const existing = ctx.db.order.id.find(BigInt(row.id));
    if (existing) {
      if (existing.remaining !== row.remaining || existing.status !== row.status) {
        ctx.db.order.id.update({ ...existing, remaining: row.remaining, status: row.status });
      }
    } else {
      ctx.db.order.insert({
        id: BigInt(row.id), marketId: row.marketId, owner: identity(row.owner), side: row.side,
        price: row.price, qty: row.qty, remaining: row.remaining, status: row.status, ts: ctx.timestamp,
      });
    }
  }
  for (const row of result.trades) {
    ctx.db.trade.insert({
      id: BigInt(row.id), marketId: row.marketId, price: row.price, qty: row.qty,
      maker: identity(row.maker), taker: identity(row.taker),
      makerOrderId: BigInt(row.makerOrderId), takerOrderId: BigInt(row.takerOrderId), ts: ctx.timestamp,
    });
  }
  for (const [owner, state] of Object.entries(result.book.accounts)) {
    const ownerIdentity = identity(owner);
    const accountRow = ctx.db.account.identity.find(ownerIdentity);
    if (!accountRow) throw new SenderError('account missing');
    if (BigInt(state.cash) !== accountRow.cash) {
      ctx.db.account.identity.update({ ...accountRow, cash: BigInt(state.cash) });
    }
    for (const [marketIdText, value] of Object.entries(state.positions)) {
      const marketId = Number(marketIdText);
      const id = `${owner}:${marketId}`;
      const existing = ctx.db.position.id.find(id);
      if (existing) {
        if (existing.qty !== value.qty || existing.avgPrice !== value.avgPrice) {
          ctx.db.position.id.update({ ...existing, qty: value.qty, avgPrice: value.avgPrice });
        }
      } else if (value.qty !== 0) {
        ctx.db.position.insert({ id, owner: ownerIdentity, marketId, qty: value.qty, avgPrice: value.avgPrice });
      }
    }
  }
  for (const event of result.events) {
    if (event.kind === 'rejected') throw new SenderError(event.reason);
    const owner = event.kind === 'trade' ? event.trade.taker : event.kind === 'order_placed' ? event.order.owner : event.owner;
    const marketId = event.kind === 'trade' ? event.trade.marketId : event.kind === 'order_placed' ? event.order.marketId : result.book.orders.find(row => row.id === event.orderId)?.marketId;
    if (marketId === undefined) throw new SenderError('event market missing');
    ctx.db.eventLog.insert({ id: BigInt(allocate(counter)), kind: event.kind, owner: identity(owner), marketId, payload: JSON.stringify(event), ts: ctx.timestamp });
  }
  const stored = ctx.db.idCounter.id.find(1)!;
  ctx.db.idCounter.id.update({ ...stored, nextId: counter.value });
}

export const init = spacetimedb.init(ctx => {
  ctx.db.adminConfig.insert({ ownerIdentity: ctx.sender });
  ctx.db.market.insert({ id: 1, symbol: 'HACK', kind: 'index', tick: 1, status: 'open' });
  ctx.db.idCounter.insert({ id: 1, nextId: 1n });
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
    const marketRow = ctx.db.market.id.find(marketId);
    if (!marketRow || marketRow.status !== 'open') throw new SenderError('market not open');
    if (price !== 0 && price !== 2_147_483_647 && price % marketRow.tick !== 0) throw new SenderError('price not on tick');
    const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
    const result = matchOrder(
      loadBook(ctx),
      { marketId, owner: ctx.sender.toHexString(), side, price, qty, tif },
      { now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => allocate(counter) }
    );
    persistResult(ctx, result, counter);
  }
);

export const cancelOrder = spacetimedb.reducer({ orderId: t.u64() }, (ctx, { orderId }) => {
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const result = cancelBookOrder(loadBook(ctx), Number(orderId), ctx.sender.toHexString(), {
    now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => allocate(counter),
  });
  persistResult(ctx, result, counter);
});
export const cancelAll = spacetimedb.reducer(ctx => {
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const owner = ctx.sender.toHexString();
  let book = loadBook(ctx);
  const events: MatchResult['events'] = [];
  for (const row of book.orders.filter(row => row.owner === owner)) {
    const result = cancelBookOrder(book, row.id, owner, {
      now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => allocate(counter),
    });
    book = result.book;
    events.push(...result.events);
  }
  persistResult(ctx, { book, trades: [], events }, counter);
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
  (ctx, { owner, kind, score, evidence, narration }) => {
    requireAdmin(ctx);
    if (kind !== 'spoofing' && kind !== 'quote_stuffing' && kind !== 'wash') throw new SenderError('invalid alert kind');
    if (score < 70 || score > 100) throw new SenderError('alert score must be 70 to 100');
    if (!ctx.db.account.identity.find(owner)) throw new SenderError('alert owner not found');
    if (evidence.length > 4096) throw new SenderError('alert evidence too large');
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(evidence) as Record<string, unknown>; } catch { throw new SenderError('invalid alert evidence JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SenderError('alert evidence must be an object');
    if (typeof parsed.incidentKey === 'string') {
      for (const row of ctx.db.alert.iter()) {
        if (row.owner.toHexString() !== owner.toHexString() || row.kind !== kind) continue;
        try {
          const prior = JSON.parse(row.evidence) as Record<string, unknown>;
          if (prior.incidentKey === parsed.incidentKey) return;
        } catch { /* older malformed evidence is ignored */ }
      }
    }
    ctx.db.alert.insert({ id: 0n, owner, kind, score, evidence, narration, ts: ctx.timestamp });
  }
);
export const adminPostNews = spacetimedb.reducer({ marketId: t.u32(), text: t.string() }, (ctx, { marketId, text }) => {
  requireAdmin(ctx);
  if (!text.trim()) throw new SenderError('news text required');
  if (!ctx.db.market.id.find(marketId)) throw new SenderError('market not found');
  ctx.db.news.insert({ id: 0n, marketId, text: text.trim(), ts: ctx.timestamp });
});
