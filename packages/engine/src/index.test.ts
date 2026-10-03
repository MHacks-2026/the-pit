import { describe, expect, it } from 'vitest';
import { cancelOrder, matchOrder, type Book } from './index';

describe('T05 engine contract stub', () => {
  const book: Book = { orders: [] };
  const ctx = { now: 123, nextId: () => 1 };

  it('matchOrder rejects without changing the book', () => {
    const result = matchOrder(book, { marketId: 1, owner: 'a', side: 'buy', price: 100, qty: 1, tif: 'GTC' }, ctx);
    expect(result.book).toBe(book);
    expect(result.trades).toEqual([]);
    expect(result.events).toEqual([{ kind: 'rejected', owner: 'a', reason: 'matching unavailable until T09', ts: 123 }]);
  });

  it('cancelOrder rejects without changing the book', () => {
    const result = cancelOrder(book, 1, 'a', ctx);
    expect(result.book).toBe(book);
    expect(result.events).toEqual([{ kind: 'rejected', owner: 'a', reason: 'cancellation unavailable until T09', ts: 123 }]);
  });
});
