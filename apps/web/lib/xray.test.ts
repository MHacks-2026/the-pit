import { describe, expect, it } from 'vitest';
import { centerPrice, copFlags, maxDepth, pushRow, rowCells, sampleRow, XRAY_HALF_WIDTH, type XrayOrder } from './xray';

const orders: XrayOrder[] = [
  { id: '1', side: 'buy', price: 99, remaining: 5 },
  { id: '2', side: 'buy', price: 99, remaining: 3 },
  { id: '3', side: 'sell', price: 101, remaining: 5 },
  { id: '10', side: 'sell', price: 103, remaining: 20 },
  { id: '11', side: 'sell', price: 104, remaining: 20 },
  { id: '12', side: 'sell', price: 105, remaining: 0 },
];

describe('depth x-ray rows', () => {
  it('sums depth per price and side and remembers which orders sit there', () => {
    const row = sampleRow(orders, [{ id: '7', price: 101 }]);
    expect(row.levels.get(99)).toEqual({ bid: 8, ask: 0, ids: ['1', '2'] });
    expect(row.levels.get(103)).toEqual({ bid: 0, ask: 20, ids: ['10'] });
    expect(row.levels.has(105)).toBe(false); // filled or cancelled orders do not count
    expect(row.trades).toEqual([{ id: '7', price: 101 }]);
  });

  it('keeps the newest row first and caps the history', () => {
    let rows = [] as ReturnType<typeof sampleRow>[];
    for (let i = 0; i < 5; i++) rows = pushRow(rows, sampleRow([{ id: String(i), side: 'buy', price: 100 + i, remaining: 1 }], []), 3);
    expect(rows).toHaveLength(3);
    expect([...rows[0].levels.keys()]).toEqual([104]);
  });

  it('centres on the mid, then the last trade, then 100', () => {
    expect(centerPrice(99, 101, 120)).toBe(100);
    expect(centerPrice(null, null, 120)).toBe(120);
    expect(centerPrice(null, null, null)).toBe(100);
  });
});

describe('Cop flags', () => {
  it('reads layered order ids and the opposite trade from alert evidence, ignoring junk', () => {
    const flags = copFlags([JSON.stringify({ layerOrderIds: [10, 11], oppositeTradeId: 7 }), 'not json', '{"layerOrderIds":["x"]}']);
    expect([...flags.orderIds]).toEqual(['10', '11']);
    expect([...flags.tradeIds]).toEqual(['7']);
  });

  it('marks only the flagged orders\' depth, across the visible range', () => {
    const row = sampleRow(orders, []);
    const qty = new Map(orders.map(o => [o.id, o.remaining]));
    const cells = rowCells(row, 100, new Set(['10']), qty);
    expect(cells).toHaveLength(2 * XRAY_HALF_WIDTH + 1);
    expect(cells.find(c => c.price === 103)).toEqual({ price: 103, bid: 0, ask: 20, flagged: 20 });
    expect(cells.find(c => c.price === 104)?.flagged).toBe(0);
    expect(cells.find(c => c.price === 99)).toEqual({ price: 99, bid: 8, ask: 0, flagged: 0 });
  });

  it('scales to the deepest visible level, never below the floor', () => {
    const rows = [sampleRow(orders, [])];
    expect(maxDepth(rows, 100)).toBe(20);
    expect(maxDepth([sampleRow([{ id: '1', side: 'buy', price: 100, remaining: 2 }], [])], 100)).toBe(10);
    expect(maxDepth([sampleRow([{ id: '1', side: 'buy', price: 200, remaining: 90 }], [])], 100)).toBe(10); // off-screen
  });
});
