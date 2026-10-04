import { schema, table, t, SenderError, Range, type ReducerCtx } from 'spacetimedb/server';
import { Identity, ScheduleAt, Timestamp } from 'spacetimedb';
import { initialLiveState, LIVE_BOTS, planLiveTick, type LiveBot, type LiveState, type LiveView } from '@the-pit/bots';
import { canonicalEvent, canonicalMarker, chainHash, detectSpoofing, GENESIS_HASH, parseEventLog, type CopEvent } from '@the-pit/cop';
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
  // Indexed so loading the book reads only open orders, not the whole order history.
  status: t.string().index('btree'), ts: t.timestamp(),
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
  // Indexed so the in-database Cop reads only the last 30 seconds of events.
  marketId: t.u32(), payload: t.string(), ts: t.timestamp().index('btree'),
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
// Last trade price per market, kept up to date by persistResult so no reducer has to scan the trade table.
const marketState = table({ name: 'market_state' }, { marketId: t.u32().primaryKey(), lastTradePrice: t.i32() });
// In-database bots: their planning state (JSON), and the schedule row that fires bot_tick every second.
const simState = table({ name: 'sim_state' }, { id: t.u32().primaryKey(), state: t.string() });
const botTickSchedule = table({ name: 'bot_tick_schedule' }, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() });
// Incidents already alerted on, so the in-database Cop (and admin_raise_alert) never alert twice.
const alertIncident = table({ name: 'alert_incident' }, { incidentKey: t.string().primaryKey() });
// Tamper-evident record: each event_log row (and each reset marker) gets a SHA-256 link to the previous one. Public, so
// anyone can verify; chain_head is the newest link, shown on the Big Screen.
const eventChain = table({ name: 'event_chain', public: true }, {
  seq: t.u64().primaryKey(), eventId: t.u64(), marker: t.string(), ts: t.timestamp(), prevHash: t.string(), hash: t.string(),
});
const chainHead = table({ name: 'chain_head', public: true }, { id: t.u32().primaryKey(), seq: t.u64(), hash: t.string() });

const spacetimedb = schema({ account, market, order, trade, position, eventLog, alert, news, adminConfig, idCounter, marketState,
  simState, botTickSchedule, alertIncident, eventChain, chainHead });
export default spacetimedb;

type ModuleCtx = ReducerCtx<typeof spacetimedb.schemaType>;

function requireAdmin(ctx: ModuleCtx): void {
  const admin = ctx.db.adminConfig.iter().next().value;
  if (!admin || admin.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('admin only');
  }
}

/** Last trade price for a market. Rebuilt once from the trade table if missing (e.g. right after an upgrade). */
function lastTradePriceOf(ctx: ModuleCtx, marketId: number): number | undefined {
  const state = ctx.db.marketState.marketId.find(marketId);
  if (state) return state.lastTradePrice;
  let latest: { time: bigint; price: number } | undefined;
  for (const row of ctx.db.trade.iter()) {
    if (row.marketId !== marketId) continue;
    const time = row.ts.microsSinceUnixEpoch;
    if (!latest || time >= latest.time) latest = { time, price: row.price };
  }
  if (!latest) return undefined;
  ctx.db.marketState.insert({ marketId, lastTradePrice: latest.price });
  return latest.price;
}

interface LoadedBook { book: Book; identities: Map<string, Identity> }

/**
 * The engine only needs open orders, the caller's account and the accounts of resting-order owners (its possible
 * counterparties), so that is all we read. Cost grows with open orders, not with the exchange's history.
 */
function loadBook(ctx: ModuleCtx, sender: Identity): LoadedBook {
  const orders: Book['orders'] = [];
  const identities = new Map<string, Identity>([[sender.toHexString(), sender]]);
  for (const row of ctx.db.order.status.filter('open')) {
    if (row.remaining === 0) continue;
    const owner = row.owner.toHexString();
    identities.set(owner, row.owner);
    orders.push({
      id: Number(row.id), marketId: row.marketId, owner,
      side: row.side as 'buy' | 'sell', price: row.price, qty: row.qty,
      remaining: row.remaining, status: 'open', tif: 'GTC',
      ts: Number(row.ts.microsSinceUnixEpoch / 1000n),
    });
  }
  const marketIds = [...ctx.db.market.iter()].map(row => row.id);
  const accounts: Book['accounts'] = {};
  for (const [owner, identity] of identities) {
    const row = ctx.db.account.identity.find(identity);
    if (!row) continue;
    accounts[owner] = { cash: Number(row.cash), positions: {} };
    for (const marketId of marketIds) {
      const position = ctx.db.position.id.find(`${owner}:${marketId}`);
      if (position) accounts[owner].positions[marketId] = { qty: position.qty, avgPrice: position.avgPrice };
    }
  }
  const lastTradePrice: Book['lastTradePrice'] = {};
  for (const marketId of marketIds) {
    const price = lastTradePriceOf(ctx, marketId);
    if (price !== undefined) lastTradePrice[marketId] = price;
  }
  return { book: { orders, accounts, lastTradePrice }, identities };
}

function allocate(counter: { value: bigint }): number {
  const id = Number(counter.value);
  if (!Number.isSafeInteger(id)) throw new SenderError('ID range exhausted');
  counter.value += 1n;
  return id;
}

/** Appends one link to the market record in the current transaction and moves the head. */
function appendChain(ctx: ModuleCtx, eventId: bigint, marker: string, canonical: string): void {
  const head = ctx.db.chainHead.id.find(1);
  const seq = (head?.seq ?? 0n) + 1n;
  const prevHash = head?.hash ?? GENESIS_HASH;
  const hash = chainHash(prevHash, canonical);
  ctx.db.eventChain.insert({ seq, eventId, marker, ts: ctx.timestamp, prevHash, hash });
  if (head) ctx.db.chainHead.id.update({ id: 1, seq, hash });
  else ctx.db.chainHead.insert({ id: 1, seq, hash });
}

function persistResult(ctx: ModuleCtx, result: MatchResult, counter: { value: bigint }, identityByHex: Map<string, Identity>): void {
  const failure = result.events.find(event => event.kind === 'rejected');
  if (failure?.kind === 'rejected') throw new SenderError(failure.reason);
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
    const state = ctx.db.marketState.marketId.find(row.marketId);
    if (state) ctx.db.marketState.marketId.update({ ...state, lastTradePrice: row.price });
    else ctx.db.marketState.insert({ marketId: row.marketId, lastTradePrice: row.price });
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
    const eventId = BigInt(allocate(counter));
    const payload = JSON.stringify(event);
    ctx.db.eventLog.insert({ id: eventId, kind: event.kind, owner: identity(owner), marketId, payload, ts: ctx.timestamp });
    appendChain(ctx, eventId, '', canonicalEvent({ id: Number(eventId), kind: event.kind, owner, marketId, payload,
      ts: ctx.timestamp.microsSinceUnixEpoch.toString() }));
  }
  const stored = ctx.db.idCounter.id.find(1)!;
  ctx.db.idCounter.id.update({ ...stored, nextId: counter.value });
}


const nowMs = (ctx: ModuleCtx) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);

interface OrderInput { marketId: number; side: 'buy' | 'sell'; price: number; qty: number; tif: 'GTC' | 'IOC' }

/** Match and persist one order for `owner`. Bots pass throwOnReject=false so one rejected order cannot undo a whole tick. */
function submitOrder(ctx: ModuleCtx, owner: Identity, order: OrderInput, throwOnReject: boolean): boolean {
  const marketRow = ctx.db.market.id.find(order.marketId);
  if (!marketRow || marketRow.status !== 'open') {
    if (throwOnReject) throw new SenderError('market not open');
    return false;
  }
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const { book, identities } = loadBook(ctx, owner);
  const result = matchOrder(book, { ...order, owner: owner.toHexString() }, { now: nowMs(ctx), nextId: () => allocate(counter) });
  if (!throwOnReject && result.events.some(event => event.kind === 'rejected')) return false;
  persistResult(ctx, result, counter, identities);
  return true;
}

function cancelFor(ctx: ModuleCtx, owner: Identity, orderId: number, throwOnReject: boolean): boolean {
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const { book, identities } = loadBook(ctx, owner);
  const result = cancelBookOrder(book, orderId, owner.toHexString(), { now: nowMs(ctx), nextId: () => allocate(counter) });
  if (!throwOnReject && result.events.some(event => event.kind === 'rejected')) return false;
  persistResult(ctx, result, counter, identities);
  return true;
}

/**
 * The Market Cop, inside the transaction: reads the last 30 s of event_log through the ts index and raises any new
 * spoofing alert in the same transaction as the cancel that completed it. A spoof completes only when most layers are
 * cancelled after the opposite trade, so this runs after cancels (and once per bot tick), not after every order.
 * With `actor`, only that account's events plus trades are parsed: the rule judges one account at a time, so other
 * accounts' order events cannot change its verdict, and skipping them keeps the check cheap when the market is busy.
 */
function copCheck(ctx: ModuleCtx, actor?: Identity): void {
  const from = Timestamp.fromDate(new Date(nowMs(ctx) - 30_000));
  const events: CopEvent[] = [];
  for (const row of ctx.db.eventLog.ts.filter(new Range<Timestamp>({ tag: 'included', value: from }, { tag: 'unbounded' }))) {
    if (actor && row.kind !== 'trade' && !row.owner.isEqual(actor)) continue;
    const event = parseEventLog({ id: Number(row.id), kind: row.kind, marketId: row.marketId, payload: row.payload });
    if (event) events.push(event);
  }
  const actorHex = actor?.toHexString();
  for (const candidate of detectSpoofing(events, nowMs(ctx))) {
    if (actorHex && candidate.owner !== actorHex) continue;
    const key = candidate.evidence.incidentKey;
    if (ctx.db.alertIncident.incidentKey.find(key)) continue;
    const owner = Identity.fromString(candidate.owner);
    if (!ctx.db.account.identity.find(owner)) continue;
    ctx.db.alertIncident.insert({ incidentKey: key });
    ctx.db.alert.insert({ id: 0n, owner, kind: candidate.kind, score: candidate.score,
      evidence: JSON.stringify(candidate.evidence), narration: undefined, ts: ctx.timestamp });
  }
}

/** Fixed, clearly synthetic identities for the in-database bots (real identities never start with b0b0). */
function botIdentity(bot: LiveBot): Identity {
  return Identity.fromString(`b0b0${(LIVE_BOTS.indexOf(bot) + 1).toString(16).padStart(60, '0')}`);
}

interface StoredSim { live: LiveState; latestNews?: { text: string; postedAt: number } }
const loadSim = (ctx: ModuleCtx): StoredSim | null => {
  const row = ctx.db.simState.id.find(1);
  return row ? JSON.parse(row.state) as StoredSim : null;
};
function saveSim(ctx: ModuleCtx, sim: StoredSim): void {
  const state = JSON.stringify(sim);
  if (ctx.db.simState.id.find(1)) ctx.db.simState.id.update({ id: 1, state });
  else ctx.db.simState.insert({ id: 1, state });
}

function openOrdersOf(ctx: ModuleCtx, owner: Identity): number[] {
  const ids: number[] = [];
  for (const row of ctx.db.order.status.filter('open')) if (row.remaining > 0 && row.owner.isEqual(owner)) ids.push(Number(row.id));
  return ids;
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
    submitOrder(ctx, ctx.sender, { marketId, side, price, qty, tif }, true);
  }
);

export const cancelOrder = spacetimedb.reducer({ orderId: t.u64() }, (ctx, { orderId }) => {
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const { book, identities } = loadBook(ctx, ctx.sender);
  const result = cancelBookOrder(book, Number(orderId), ctx.sender.toHexString(), {
    now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => allocate(counter),
  });
  persistResult(ctx, result, counter, identities);
  copCheck(ctx, ctx.sender);
});
export const cancelAll = spacetimedb.reducer(ctx => {
  const counter = { value: ctx.db.idCounter.id.find(1)!.nextId };
  const owner = ctx.sender.toHexString();
  const loaded = loadBook(ctx, ctx.sender);
  let book = loaded.book;
  const events: MatchResult['events'] = [];
  for (const row of book.orders.filter(row => row.owner === owner)) {
    const result = cancelBookOrder(book, row.id, owner, {
      now: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n), nextId: () => allocate(counter),
    });
    book = result.book;
    events.push(...result.events);
  }
  persistResult(ctx, { book, trades: [], events }, counter, loaded.identities);
  copCheck(ctx, ctx.sender);
});
export const adminSettle = spacetimedb.reducer({ marketId: t.u32(), outcome: t.bool() }, ctx => {
  requireAdmin(ctx);
  throw new SenderError('settlement not implemented');
});
/**
 * Fresh market for a demo: deletes the market's orders (open ones included), trades, positions, event log and news,
 * all alerts, and every human account (players rejoin from /join); bots stay with cash back at 10,000. Cash is not
 * per market, but HACK is the only market. In-database bots keep running from a fresh state (hidden value 100).
 */
export const adminResetMarket = spacetimedb.reducer({ marketId: t.u32() }, (ctx, { marketId }) => {
  requireAdmin(ctx);
  if (!ctx.db.market.id.find(marketId)) throw new SenderError('market not found');
  for (const row of [...ctx.db.order.iter()]) if (row.marketId === marketId) ctx.db.order.id.delete(row.id);
  for (const row of [...ctx.db.trade.iter()]) if (row.marketId === marketId) ctx.db.trade.id.delete(row.id);
  for (const row of [...ctx.db.position.iter()]) if (row.marketId === marketId) ctx.db.position.id.delete(row.id);
  for (const row of [...ctx.db.eventLog.iter()]) if (row.marketId === marketId) ctx.db.eventLog.id.delete(row.id);
  for (const row of [...ctx.db.news.iter()]) if (row.marketId === marketId) ctx.db.news.id.delete(row.id);
  for (const row of [...ctx.db.alert.iter()]) ctx.db.alert.id.delete(row.id);
  for (const row of [...ctx.db.alertIncident.iter()]) ctx.db.alertIncident.incidentKey.delete(row.incidentKey);
  ctx.db.marketState.marketId.delete(marketId);
  // The record restarts with a reset marker that links to the previous head, so the reset itself is on the record.
  for (const row of [...ctx.db.eventChain.iter()]) ctx.db.eventChain.seq.delete(row.seq);
  const marker = `reset:${marketId}`;
  appendChain(ctx, 0n, marker, canonicalMarker(marker, ctx.timestamp.microsSinceUnixEpoch.toString()));
  for (const row of [...ctx.db.account.iter()]) {
    if (!row.isBot) ctx.db.account.identity.delete(row.identity);
    else if (row.cash !== 10_000n) ctx.db.account.identity.update({ ...row, cash: 10_000n });
  }
  const sim = loadSim(ctx);
  if (sim) saveSim(ctx, { live: initialLiveState(nowMs(ctx), sim.live.adaptiveEnabled) });
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
      if (ctx.db.alertIncident.incidentKey.find(parsed.incidentKey)) return;
      ctx.db.alertIncident.insert({ incidentKey: parsed.incidentKey });
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

/** Start the in-database bots (replaces apps/runner). Stop the old runner first: its bots' leftover orders are cancelled here. */
export const adminBotsStart = spacetimedb.reducer({ adaptive: t.bool() }, (ctx, { adaptive }) => {
  requireAdmin(ctx);
  const bots = LIVE_BOTS.filter(bot => adaptive || bot !== 'adaptive');
  const mine = new Set(bots.map(bot => botIdentity(bot).toHexString()));
  for (const bot of bots) {
    const identity = botIdentity(bot);
    const existing = ctx.db.account.identity.find(identity);
    if (existing) ctx.db.account.identity.update({ ...existing, name: bot, isBot: true });
    else ctx.db.account.insert({ identity, name: bot, cash: 10_000n, isBot: true, createdAt: ctx.timestamp });
  }
  for (const row of [...ctx.db.account.iter()]) {
    if (!row.isBot || mine.has(row.identity.toHexString())) continue;
    for (const id of openOrdersOf(ctx, row.identity)) cancelFor(ctx, row.identity, id, false);
  }
  saveSim(ctx, { live: initialLiveState(nowMs(ctx), adaptive) });
  if (![...ctx.db.botTickSchedule.iter()].length) {
    ctx.db.botTickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(1_000_000n) });
  }
});

/** Stop the in-database bots and cancel their open orders. */
export const adminBotsStop = spacetimedb.reducer(ctx => {
  requireAdmin(ctx);
  for (const row of [...ctx.db.botTickSchedule.iter()]) ctx.db.botTickSchedule.scheduledId.delete(row.scheduledId);
  for (const bot of LIVE_BOTS) {
    const identity = botIdentity(bot);
    for (const id of openOrdersOf(ctx, identity)) cancelFor(ctx, identity, id, false);
  }
});

/** One bot tick, run by the scheduler every second: plan with packages/bots, execute, then run the Cop. */
export const botTick = spacetimedb.reducer({ onSchedule: botTickSchedule }, { arg: botTickSchedule.rowType }, ctx => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('bot_tick runs on the schedule only');
  const sim = loadSim(ctx);
  if (!sim) return;
  const now = nowMs(ctx);
  const marketId = 1;
  const open = [...ctx.db.order.status.filter('open')].filter(row => row.marketId === marketId && row.remaining > 0);
  const bids = open.filter(row => row.side === 'buy').map(row => row.price);
  const asks = open.filter(row => row.side === 'sell').map(row => row.price);
  const bestBid = bids.length ? Math.max(...bids) : undefined;
  const bestAsk = asks.length ? Math.min(...asks) : undefined;
  const midPrice = bestBid !== undefined && bestAsk !== undefined ? Math.round((bestBid + bestAsk) / 2)
    : lastTradePriceOf(ctx, marketId) ?? 100;
  const bots: LiveView['bots'] = {};
  for (const bot of LIVE_BOTS) {
    const identity = botIdentity(bot);
    const account = ctx.db.account.identity.find(identity);
    if (!account) continue;
    const owner = identity.toHexString();
    bots[bot] = { owner, cash: Number(account.cash), position: ctx.db.position.id.find(`${owner}:${marketId}`)?.qty ?? 0,
      openOrderIds: open.filter(row => row.owner.isEqual(identity)).map(row => Number(row.id)) };
  }
  const plan = planLiveTick(sim.live, { now, marketId, touch: { bestBid, bestAsk, midPrice }, bots, latestNews: sim.latestNews },
    () => ctx.random());
  for (const action of plan.actions) {
    const identity = botIdentity(action.bot);
    for (const id of action.cancel) cancelFor(ctx, identity, id, false);
    for (const order of action.place) submitOrder(ctx, identity, order, false);
  }
  let latestNews = sim.latestNews;
  for (const text of plan.publishNews) {
    ctx.db.news.insert({ id: 0n, marketId, text, ts: ctx.timestamp });
    latestNews = { text, postedAt: now };
  }
  saveSim(ctx, { live: plan.state, latestNews });
  copCheck(ctx);
});

