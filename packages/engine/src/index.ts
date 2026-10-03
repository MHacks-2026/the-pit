export type Side = 'buy' | 'sell';
export type Tif = 'GTC' | 'IOC';

export interface NewOrder {
  marketId: number;
  owner: string;
  side: Side;
  price: number;
  qty: number;
  tif: Tif;
}

export interface Order extends NewOrder {
  id: number;
  remaining: number;
  status: 'open' | 'filled' | 'cancelled';
  ts: number;
}

export interface Trade {
  id: number;
  marketId: number;
  price: number;
  qty: number;
  maker: string;
  taker: string;
  makerOrderId: number;
  takerOrderId: number;
  ts: number;
}

export interface Ctx {
  now: number;
  nextId: () => number;
}

export type EngineEvent =
  | { kind: 'order_placed'; order: Order }
  | { kind: 'order_cancelled'; orderId: number; owner: string; ts: number }
  | { kind: 'trade'; trade: Trade }
  | { kind: 'self_trade_attempt'; owner: string; orderId: number; ts: number }
  | { kind: 'rejected'; owner: string; reason: string; ts: number };

export interface Book {
  orders: Order[];
  accounts: Record<string, RiskAccount>;
  lastTradePrice: Record<number, number>;
}

export interface PositionState {
  qty: number;
  avgPrice: number;
}

export interface RiskAccount {
  cash: number;
  positions: Record<number, PositionState>;
}

export interface MatchResult {
  book: Book;
  trades: Trade[];
  events: EngineEvent[];
}

const MARKET_BUY_PRICE = 2_147_483_647;
const MAX_POSITION = 200;

function rejected(book: Book, owner: string, reason: string, now: number): MatchResult {
  return { book, trades: [], events: [{ kind: 'rejected', owner, reason, ts: now }] };
}

function cloneBook(book: Book): Book {
  return {
    orders: book.orders.map(order => ({ ...order })),
    accounts: Object.fromEntries(Object.entries(book.accounts).map(([owner, account]) => [owner, {
      cash: account.cash,
      positions: Object.fromEntries(Object.entries(account.positions).map(([marketId, position]) => [marketId, { ...position }])),
    }])),
    lastTradePrice: { ...book.lastTradePrice },
  };
}

function applyFill(account: RiskAccount, marketId: number, deltaQty: number, price: number): void {
  const previous = account.positions[marketId] ?? { qty: 0, avgPrice: 0 };
  const nextQty = previous.qty + deltaQty;
  let avgPrice = previous.avgPrice;
  if (nextQty === 0) avgPrice = 0;
  else if (previous.qty === 0 || Math.sign(previous.qty) !== Math.sign(nextQty)) avgPrice = price;
  else if (Math.sign(previous.qty) === Math.sign(deltaQty)) {
    avgPrice = Math.trunc((Math.abs(previous.qty) * previous.avgPrice + Math.abs(deltaQty) * price) / Math.abs(nextQty));
  }
  account.positions[marketId] = { qty: nextQty, avgPrice };
  account.cash -= deltaQty * price;
}

function oppositePriority(side: Side, a: Order, b: Order): number {
  const priceOrder = side === 'buy' ? a.price - b.price : b.price - a.price;
  return priceOrder || a.ts - b.ts || a.id - b.id;
}

export function matchOrder(book: Book, incoming: NewOrder, ctx: Ctx): MatchResult {
  if (!Number.isSafeInteger(ctx.now)) return rejected(book, incoming.owner, 'invalid clock', ctx.now);
  if (!Number.isSafeInteger(incoming.marketId) || incoming.marketId < 0) return rejected(book, incoming.owner, 'invalid market', ctx.now);
  if (incoming.side !== 'buy' && incoming.side !== 'sell') return rejected(book, incoming.owner, 'invalid side', ctx.now);
  if (incoming.tif !== 'GTC' && incoming.tif !== 'IOC') return rejected(book, incoming.owner, 'invalid time in force', ctx.now);
  if (!Number.isSafeInteger(incoming.qty) || incoming.qty < 1 || incoming.qty > 50) return rejected(book, incoming.owner, 'order size must be 1 to 50', ctx.now);
  if (!Number.isSafeInteger(incoming.price) || incoming.price < 0 || incoming.price > MARKET_BUY_PRICE) return rejected(book, incoming.owner, 'invalid price', ctx.now);
  const marketOrder = incoming.tif === 'IOC' && (incoming.side === 'buy' ? incoming.price === MARKET_BUY_PRICE : incoming.price === 0);
  if (!marketOrder && incoming.price === 0) return rejected(book, incoming.owner, 'invalid price', ctx.now);
  const account = book.accounts[incoming.owner];
  if (!account || !Number.isSafeInteger(account.cash)) return rejected(book, incoming.owner, 'account not found', ctx.now);
  const lastPrice = book.lastTradePrice[incoming.marketId];
  if (!marketOrder && lastPrice !== undefined && Math.abs(incoming.price - lastPrice) * 5 > lastPrice) {
    return rejected(book, incoming.owner, 'price outside 20% band', ctx.now);
  }
  const ownOpen = book.orders.filter(order => order.owner === incoming.owner && order.status === 'open' && order.remaining > 0);
  if (incoming.tif === 'GTC' && ownOpen.length >= 20) return rejected(book, incoming.owner, 'too many open orders', ctx.now);
  const position = account.positions[incoming.marketId]?.qty ?? 0;
  const exposedQty = ownOpen.filter(order => order.marketId === incoming.marketId && order.side === incoming.side)
    .reduce((sum, order) => sum + order.remaining, 0);
  if (incoming.side === 'buy' && position + exposedQty + incoming.qty > MAX_POSITION) return rejected(book, incoming.owner, 'position limit', ctx.now);
  if (incoming.side === 'sell' && position - exposedQty - incoming.qty < -MAX_POSITION) return rejected(book, incoming.owner, 'position limit', ctx.now);

  const opposing = book.orders.filter(order => order.marketId === incoming.marketId && order.side !== incoming.side && order.status === 'open' && order.remaining > 0)
    .sort((a, b) => oppositePriority(incoming.side, a, b));
  if (incoming.side === 'buy') {
    const reserved = ownOpen.filter(order => order.side === 'buy').reduce((sum, order) => sum + order.remaining * order.price, 0);
    if (!Number.isSafeInteger(reserved)) return rejected(book, incoming.owner, 'cash calculation overflow', ctx.now);
    let required = incoming.qty * incoming.price;
    if (marketOrder) {
      let remaining = incoming.qty;
      required = 0;
      for (const maker of opposing) {
        if (maker.owner === incoming.owner || remaining === 0) break;
        const fill = Math.min(remaining, maker.remaining);
        required += fill * maker.price;
        remaining -= fill;
      }
    }
    if (!Number.isSafeInteger(required + reserved) || required + reserved > account.cash) {
      return rejected(book, incoming.owner, 'insufficient cash', ctx.now);
    }
  }

  const next = cloneBook(book);
  const placed: Order = { ...incoming, id: ctx.nextId(), remaining: incoming.qty, status: 'open', ts: ctx.now };
  const events: EngineEvent[] = [{ kind: 'order_placed', order: { ...placed } }];
  const trades: Trade[] = [];
  for (const candidate of opposing) {
    if (placed.remaining === 0) break;
    if (incoming.side === 'buy' ? candidate.price > incoming.price : candidate.price < incoming.price) break;
    if (candidate.owner === incoming.owner) {
      placed.status = 'cancelled';
      events.push({ kind: 'self_trade_attempt', owner: incoming.owner, orderId: placed.id, ts: ctx.now });
      events.push({ kind: 'order_cancelled', orderId: placed.id, owner: incoming.owner, ts: ctx.now });
      break;
    }
    const maker = next.orders.find(order => order.id === candidate.id)!;
    const qty = Math.min(placed.remaining, maker.remaining);
    const trade: Trade = {
      id: ctx.nextId(), marketId: incoming.marketId, price: maker.price, qty,
      maker: maker.owner, taker: incoming.owner, makerOrderId: maker.id, takerOrderId: placed.id, ts: ctx.now,
    };
    maker.remaining -= qty;
    if (maker.remaining === 0) maker.status = 'filled';
    placed.remaining -= qty;
    if (placed.remaining === 0) placed.status = 'filled';
    const buyer = incoming.side === 'buy' ? incoming.owner : maker.owner;
    const seller = incoming.side === 'sell' ? incoming.owner : maker.owner;
    applyFill(next.accounts[buyer], incoming.marketId, qty, maker.price);
    applyFill(next.accounts[seller], incoming.marketId, -qty, maker.price);
    next.lastTradePrice[incoming.marketId] = maker.price;
    trades.push(trade);
    events.push({ kind: 'trade', trade });
  }
  if (placed.remaining > 0 && placed.status === 'open' && incoming.tif === 'IOC') {
    placed.status = 'cancelled';
    events.push({ kind: 'order_cancelled', orderId: placed.id, owner: incoming.owner, ts: ctx.now });
  }
  next.orders.push(placed);
  return { book: next, trades, events };
}

export function cancelOrder(book: Book, orderId: number, owner: string, ctx: Ctx): MatchResult {
  const existing = book.orders.find(order => order.id === orderId && order.status === 'open' && order.remaining > 0);
  if (!existing) return rejected(book, owner, 'order not open', ctx.now);
  if (existing.owner !== owner) return rejected(book, owner, 'not order owner', ctx.now);
  const next = cloneBook(book);
  next.orders.find(order => order.id === orderId)!.status = 'cancelled';
  return { book: next, trades: [], events: [{ kind: 'order_cancelled', orderId, owner, ts: ctx.now }] };
}
