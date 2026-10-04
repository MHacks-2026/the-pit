// Depth X-ray (T30/T36): the last ~30 seconds of the live order book as rows of depth by price, newest first.
// Pure helpers, so the 3D view only draws. Each row keeps which order ids rested at each price, so when the Cop
// later names a wall's orders, the wall can be highlighted retroactively in the history already on screen.

export const XRAY_ROWS = 72;
export const XRAY_SAMPLE_MS = 400;
export const XRAY_HALF_WIDTH = 15; // ticks either side of the centre price

export interface XrayOrder { id: string; side: 'buy' | 'sell'; price: number; remaining: number }
export interface XrayTrade { id: string; price: number }

export interface XrayLevel { bid: number; ask: number; ids: string[] }
export interface XrayRow {
  /** Depth by absolute price. */
  levels: Map<number, XrayLevel>;
  /** Trades that happened since the previous row. */
  trades: XrayTrade[];
}

/** One snapshot of the open book plus the trades since the last snapshot. */
export function sampleRow(orders: readonly XrayOrder[], newTrades: readonly XrayTrade[]): XrayRow {
  const levels = new Map<number, XrayLevel>();
  for (const order of orders) {
    if (order.remaining <= 0 || !Number.isFinite(order.price)) continue;
    const level = levels.get(order.price) ?? { bid: 0, ask: 0, ids: [] };
    if (order.side === 'buy') level.bid += order.remaining;
    else level.ask += order.remaining;
    level.ids.push(order.id);
    levels.set(order.price, level);
  }
  return { levels, trades: [...newTrades] };
}

/** Newest row first, capped at `max` rows. */
export function pushRow(rows: readonly XrayRow[], row: XrayRow, max = XRAY_ROWS): XrayRow[] {
  return [row, ...rows].slice(0, max);
}

/** Centre of the price axis: the mid if there is a two-sided book, else the last trade, else 100. */
export function centerPrice(bestBid: number | null, bestAsk: number | null, lastPrice: number | null): number {
  if (bestBid !== null && bestAsk !== null) return Math.round((bestBid + bestAsk) / 2);
  return bestBid ?? bestAsk ?? lastPrice ?? 100;
}

/** What the Cop has named: the layered order ids and the opposite-side trade ids, from alert evidence JSON. */
export function copFlags(evidenceJson: readonly string[]): { orderIds: Set<string>; tradeIds: Set<string> } {
  const orderIds = new Set<string>();
  const tradeIds = new Set<string>();
  for (const raw of evidenceJson) {
    try {
      const evidence = JSON.parse(raw) as { layerOrderIds?: unknown; oppositeTradeId?: unknown };
      if (Array.isArray(evidence.layerOrderIds)) {
        for (const id of evidence.layerOrderIds) if (Number.isSafeInteger(id)) orderIds.add(String(id));
      }
      if (Number.isSafeInteger(evidence.oppositeTradeId)) tradeIds.add(String(evidence.oppositeTradeId));
    } catch { /* ignore malformed evidence */ }
  }
  return { orderIds, tradeIds };
}

export interface XrayCell { price: number; bid: number; ask: number; flagged: number }

/** The row as cells across the visible price range; `flagged` is the depth belonging to orders the Cop named. */
export function rowCells(row: XrayRow, center: number, flagged: ReadonlySet<string>, orderQty: ReadonlyMap<string, number>,
  half = XRAY_HALF_WIDTH): XrayCell[] {
  const cells: XrayCell[] = [];
  for (let price = center - half; price <= center + half; price++) {
    const level = row.levels.get(price);
    let flaggedQty = 0;
    if (level) for (const id of level.ids) if (flagged.has(id)) flaggedQty += orderQty.get(id) ?? 0;
    cells.push({ price, bid: level?.bid ?? 0, ask: level?.ask ?? 0, flagged: Math.min(flaggedQty, (level?.bid ?? 0) + (level?.ask ?? 0)) });
  }
  return cells;
}

/** The largest depth at any visible level in the history, for scaling heights (at least `floor`). */
export function maxDepth(rows: readonly XrayRow[], center: number, half = XRAY_HALF_WIDTH, floor = 10): number {
  let max = floor;
  for (const row of rows) {
    for (const [price, level] of row.levels) {
      if (Math.abs(price - center) <= half) max = Math.max(max, level.bid + level.ask);
    }
  }
  return max;
}
