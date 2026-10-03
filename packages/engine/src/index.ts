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
}

export interface MatchResult {
  book: Book;
  trades: Trade[];
  events: EngineEvent[];
}

export function matchOrder(book: Book, incoming: NewOrder, ctx: Ctx): MatchResult {
  return {
    book,
    trades: [],
    events: [{ kind: 'rejected', owner: incoming.owner, reason: 'matching unavailable until T09', ts: ctx.now }],
  };
}

export function cancelOrder(book: Book, _orderId: number, owner: string, ctx: Ctx): MatchResult {
  return {
    book,
    trades: [],
    events: [{ kind: 'rejected', owner, reason: 'cancellation unavailable until T09', ts: ctx.now }],
  };
}
