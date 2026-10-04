export type CopEvent =
  | { kind: 'order_placed'; logId: number; owner: string; marketId: number; orderId: number; side: 'buy' | 'sell'; price: number; qty: number; tif: 'GTC' | 'IOC'; ts: number }
  | { kind: 'order_cancelled'; logId: number; owner: string; marketId: number; orderId: number; ts: number }
  | { kind: 'trade'; logId: number; marketId: number; id: number; maker: string; taker: string; makerOrderId: number; takerOrderId: number; price: number; qty: number; ts: number }
  | { kind: 'self_trade_attempt'; logId: number; owner: string; marketId: number; orderId: number; ts: number };

export interface EventLogInput { id: number; kind: string; marketId: number; payload: string }

export interface SpoofEvidence {
  incidentKey: string;
  marketId: number;
  layerSide: 'buy' | 'sell';
  layerOrderIds: number[];
  layerPrices: number[];
  placedAt: number[];
  oppositeTradeId: number;
  oppositeTradeAt: number;
  cancelledOrderIds: number[];
  cancelledQty: number;
  totalLayeredQty: number;
  medianOrderQty: number;
}

export interface AlertCandidate { owner: string; kind: 'spoofing'; score: number; evidence: SpoofEvidence; ts: number }

export function parseEventLog(row: EventLogInput): CopEvent | null {
  let payload: unknown;
  try { payload = JSON.parse(row.payload); } catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  const event = payload as Record<string, unknown>;
  if (event.kind !== row.kind) return null;
  if (event.kind === 'order_placed') {
    const order = event.order as Record<string, unknown> | undefined;
    if (!order || typeof order.owner !== 'string' || !Number.isSafeInteger(order.id) ||
      (order.side !== 'buy' && order.side !== 'sell') || !Number.isSafeInteger(order.price) ||
      !Number.isSafeInteger(order.qty) || (order.tif !== 'GTC' && order.tif !== 'IOC') || !Number.isSafeInteger(order.ts)) return null;
    return { kind: 'order_placed', logId: row.id, owner: order.owner, marketId: row.marketId,
      orderId: order.id as number, side: order.side, price: order.price as number,
      qty: order.qty as number, tif: order.tif, ts: order.ts as number };
  }
  if (event.kind === 'trade') {
    const trade = event.trade as Record<string, unknown> | undefined;
    if (!trade || typeof trade.maker !== 'string' || typeof trade.taker !== 'string' ||
      ![trade.id, trade.makerOrderId, trade.takerOrderId, trade.price, trade.qty, trade.ts].every(Number.isSafeInteger)) return null;
    return { kind: 'trade', logId: row.id, marketId: row.marketId, id: trade.id as number,
      maker: trade.maker, taker: trade.taker, makerOrderId: trade.makerOrderId as number,
      takerOrderId: trade.takerOrderId as number, price: trade.price as number, qty: trade.qty as number, ts: trade.ts as number };
  }
  if (event.kind === 'order_cancelled' || event.kind === 'self_trade_attempt') {
    if (typeof event.owner !== 'string' || !Number.isSafeInteger(event.orderId) || !Number.isSafeInteger(event.ts)) return null;
    return { kind: event.kind, logId: row.id, owner: event.owner, marketId: row.marketId, orderId: event.orderId as number, ts: event.ts as number };
  }
  return null;
}

export function rollingWindow(events: readonly CopEvent[], now: number): CopEvent[] {
  return events.filter(event => event.ts >= now - 30_000 && event.ts <= now)
    .sort((a, b) => a.ts - b.ts || a.logId - b.logId);
}

export function detectSpoofing(events: readonly CopEvent[], now: number): AlertCandidate[] {
  const window = rollingWindow(events, now);
  const placements = window.filter((event): event is Extract<CopEvent, { kind: 'order_placed' }> => event.kind === 'order_placed');
  const cancellations = window.filter((event): event is Extract<CopEvent, { kind: 'order_cancelled' }> => event.kind === 'order_cancelled');
  const trades = window.filter((event): event is Extract<CopEvent, { kind: 'trade' }> => event.kind === 'trade');
  const byOrderId = new Map(placements.map(event => [event.orderId, event]));
  const alerts: AlertCandidate[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    for (const [owner, orderId] of [[trade.maker, trade.makerOrderId], [trade.taker, trade.takerOrderId]] as const) {
      const tradeSide = byOrderId.get(orderId)?.side;
      if (!tradeSide) continue;
      const layerSide = tradeSide === 'buy' ? 'sell' : 'buy';
      const layers = placements.filter(event => event.owner === owner && event.marketId === trade.marketId &&
        event.side === layerSide && event.tif === 'GTC' && event.ts >= trade.ts - 3_000 && event.ts <= trade.ts);
      if (layers.length < 3 || new Set(layers.map(event => event.price)).size < 2) continue;
      const sizes = placements.filter(event => event.owner === owner).map(event => event.qty).sort((a, b) => a - b);
      const median = sizes.length % 2 ? sizes[Math.floor(sizes.length / 2)] :
        (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2;
      const total = layers.reduce((sum, event) => sum + event.qty, 0);
      if (total < 3 * median) continue;
      let cancelledQty = 0;
      const cancelledOrderIds: number[] = [];
      for (const layer of layers) {
        const cancel = cancellations.find(event => event.orderId === layer.orderId && event.owner === owner &&
          event.ts >= trade.ts && event.ts <= trade.ts + 5_000);
        if (!cancel) continue;
        const filled = trades.filter(event => event.ts >= layer.ts && event.ts <= cancel.ts &&
          (event.makerOrderId === layer.orderId || event.takerOrderId === layer.orderId))
          .reduce((sum, event) => sum + event.qty, 0);
        cancelledQty += Math.max(0, layer.qty - filled);
        cancelledOrderIds.push(layer.orderId);
      }
      if (cancelledQty * 5 < total * 4) continue;
      const layerOrderIds = layers.map(event => event.orderId).sort((a, b) => a - b);
      const incidentKey = `${owner}:${trade.marketId}:${layerOrderIds.join(',')}`;
      if (seen.has(incidentKey)) continue;
      seen.add(incidentKey);
      alerts.push({
        owner, kind: 'spoofing', score: Math.min(100, 70 + Math.round(30 * cancelledQty / total)), ts: trade.ts,
        evidence: { incidentKey, marketId: trade.marketId, layerSide, layerOrderIds,
          layerPrices: layers.map(event => event.price), placedAt: layers.map(event => event.ts),
          oppositeTradeId: trade.id, oppositeTradeAt: trade.ts, cancelledOrderIds,
          cancelledQty, totalLayeredQty: total, medianOrderQty: median },
      });
    }
  }
  return alerts;
}

export * from './explain';
export * from './extra';
