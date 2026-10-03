import { describe, expect, it } from 'vitest';
import { cancelOrder, matchOrder, type Book, type NewOrder } from './index';

function emptyBook(cash = 10_000): Book {
  return {
    orders: [],
    accounts: {
      a: { cash, positions: {} },
      b: { cash, positions: {} },
      c: { cash, positions: {} },
    },
    lastTradePrice: { 1: 100 },
  };
}

function order(owner: string, side: 'buy' | 'sell', price: number, qty: number, tif: 'GTC' | 'IOC' = 'GTC'): NewOrder {
  return { marketId: 1, owner, side, price, qty, tif };
}

describe('matchOrder', () => {
  it('fills across price levels at maker prices and updates cash and positions', () => {
    let id = 0;
    let book = emptyBook();
    book = matchOrder(book, order('a', 'sell', 99, 2), { now: 1, nextId: () => ++id }).book;
    book = matchOrder(book, order('b', 'sell', 100, 3), { now: 2, nextId: () => ++id }).book;
    const result = matchOrder(book, order('c', 'buy', 100, 4), { now: 3, nextId: () => ++id });
    expect(result.trades.map(trade => [trade.price, trade.qty])).toEqual([[99, 2], [100, 2]]);
    expect(result.book.orders.map(row => [row.remaining, row.status])).toEqual([[0, 'filled'], [1, 'open'], [0, 'filled']]);
    expect(result.book.accounts.c.cash).toBe(9602);
    expect(result.book.accounts.c.positions[1]).toEqual({ qty: 4, avgPrice: 99 });
    expect(result.book.accounts.a.positions[1]).toEqual({ qty: -2, avgPrice: 99 });
    expect(result.book.lastTradePrice[1]).toBe(100);
    expect(book.orders[0].remaining).toBe(2);
  });

  it('uses FIFO at the same price', () => {
    let id = 0;
    let book = emptyBook();
    book = matchOrder(book, order('a', 'sell', 100, 2), { now: 1, nextId: () => ++id }).book;
    book = matchOrder(book, order('b', 'sell', 100, 2), { now: 2, nextId: () => ++id }).book;
    const result = matchOrder(book, order('c', 'buy', 100, 3), { now: 3, nextId: () => ++id });
    expect(result.trades.map(trade => trade.maker)).toEqual(['a', 'b']);
    expect(result.book.orders.slice(0, 2).map(row => row.remaining)).toEqual([0, 1]);
  });

  it('cancels an IOC remainder and prevents self trades', () => {
    let id = 0;
    let book = emptyBook();
    book = matchOrder(book, order('a', 'sell', 100, 1), { now: 1, nextId: () => ++id }).book;
    const ioc = matchOrder(book, order('b', 'buy', 100, 3, 'IOC'), { now: 2, nextId: () => ++id });
    expect(ioc.trades).toHaveLength(1);
    expect(ioc.book.orders.at(-1)).toMatchObject({ remaining: 2, status: 'cancelled' });
    expect(ioc.events.some(event => event.kind === 'order_cancelled')).toBe(true);
    const self = matchOrder(ioc.book, order('a', 'buy', 100, 1), { now: 3, nextId: () => ++id });
    expect(self.events.some(event => event.kind === 'self_trade_attempt')).toBe(false);
    const resting = matchOrder(emptyBook(), order('a', 'sell', 100, 2), { now: 1, nextId: () => ++id });
    const attempted = matchOrder(resting.book, order('a', 'buy', 100, 1), { now: 2, nextId: () => ++id });
    expect(attempted.trades).toEqual([]);
    expect(attempted.events.some(event => event.kind === 'self_trade_attempt')).toBe(true);
    expect(attempted.book.orders.at(-1)?.status).toBe('cancelled');
  });

  it('rejects invalid risk without allocating an ID or mutating the book', () => {
    let allocated = 0;
    const ctx = { now: 1, nextId: () => ++allocated };
    const book = emptyBook(100);
    for (const [input, reason] of [
      [order('a', 'buy', 100, 51), 'order size'],
      [order('a', 'buy', 121, 1), 'price outside'],
      [order('a', 'buy', 100, 2), 'insufficient cash'],
    ] as const) {
      const result = matchOrder(book, input, ctx);
      expect(result.book).toBe(book);
      expect(result.events[0]).toMatchObject({ kind: 'rejected' });
      expect(JSON.stringify(result.events)).toContain(reason);
    }
    expect(allocated).toBe(0);
  });

  it('supports a market IOC at an extreme integer price', () => {
    let id = 0;
    let book = matchOrder(emptyBook(), order('a', 'sell', 100, 2), { now: 1, nextId: () => ++id }).book;
    const result = matchOrder(book, order('b', 'buy', 2_147_483_647, 3, 'IOC'), { now: 2, nextId: () => ++id });
    expect(result.trades).toMatchObject([{ price: 100, qty: 2 }]);
    expect(result.book.orders.at(-1)).toMatchObject({ remaining: 1, status: 'cancelled' });
  });

  it('preserves quantity, cash, positions and an uncrossed resting book for seeded flow', () => {
    const stream: NewOrder[] = [];
    let seed = 17;
    for (let i = 0; i < 80; i++) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      stream.push(order(['a', 'b', 'c'][seed % 3], seed & 4 ? 'buy' : 'sell', 95 + seed % 11, 1 + seed % 4));
    }
    const replay = () => {
      let id = 0;
      let book = emptyBook(100_000);
      const trades = [];
      for (let i = 0; i < stream.length; i++) {
        const result = matchOrder(book, stream[i], { now: i + 1, nextId: () => ++id });
        book = result.book;
        trades.push(...result.trades);
        const bids = book.orders.filter(row => row.status === 'open' && row.side === 'buy');
        const asks = book.orders.filter(row => row.status === 'open' && row.side === 'sell');
        if (bids.length && asks.length) expect(Math.max(...bids.map(row => row.price))).toBeLessThan(Math.min(...asks.map(row => row.price)));
      }
      expect(Object.values(book.accounts).reduce((sum, account) => sum + account.cash, 0)).toBe(300_000);
      expect(Object.values(book.accounts).reduce((sum, account) => sum + (account.positions[1]?.qty ?? 0), 0)).toBe(0);
      for (const row of book.orders) {
        const filled = trades.filter(trade => trade.makerOrderId === row.id || trade.takerOrderId === row.id)
          .reduce((sum, trade) => sum + trade.qty, 0);
        expect(row.qty).toBe(row.remaining + filled);
      }
      return { book, trades };
    };
    expect(replay()).toEqual(replay());
  });
});

describe('cancelOrder', () => {
  it('cancels only an open order owned by the caller', () => {
    let id = 0;
    const book = matchOrder(emptyBook(), order('a', 'buy', 100, 2), { now: 1, nextId: () => ++id }).book;
    expect(cancelOrder(book, 1, 'b', { now: 2, nextId: () => ++id }).events[0]).toMatchObject({ kind: 'rejected', reason: 'not order owner' });
    const result = cancelOrder(book, 1, 'a', { now: 2, nextId: () => ++id });
    expect(result.book.orders[0].status).toBe('cancelled');
    expect(book.orders[0].status).toBe('open');
    expect(cancelOrder(result.book, 1, 'a', { now: 3, nextId: () => ++id }).events[0]).toMatchObject({ kind: 'rejected' });
  });
});
