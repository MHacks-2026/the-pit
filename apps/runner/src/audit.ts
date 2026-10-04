import { parseEventLog } from '@the-pit/cop';

export interface AuditSnapshot {
  accounts: { owner: string; cash: bigint }[];
  positions: { owner: string; marketId: number; qty: number }[];
  orders: { id: number; owner: string; marketId: number; side: string; price: number; qty: number; remaining: number; status: string }[];
  trades: { id: number; marketId: number; price: number; qty: number; maker: string; taker: string; makerOrderId: number; takerOrderId: number }[];
  events: { id: number; kind: string; marketId: number; payload: string }[];
  alerts: { id: number; owner: string; kind: string; evidence: string }[];
}

export interface AuditIssue { code: string; detail: string }

/** Check the current HACK-only exchange snapshot without changing any rows. */
export function auditSnapshot(snapshot: AuditSnapshot): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const fail = (code: string, detail: string) => issues.push({ code, detail });
  const accounts = new Map(snapshot.accounts.map(row => [row.owner, row]));
  const orders = new Map(snapshot.orders.map(row => [row.id, row]));
  const trades = new Map(snapshot.trades.map(row => [row.id, row]));
  const fills = new Map<number, number>();
  const expectedCash = new Map(snapshot.accounts.map(row => [row.owner, 10_000n]));
  const expectedQty = new Map<string, number>();
  const key = (owner: string, marketId: number) => `${owner}:${marketId}`;

  for (const order of snapshot.orders) {
    if (!accounts.has(order.owner)) fail('ORDER_OWNER', `order ${order.id} has no account`);
    if (!Number.isSafeInteger(order.qty) || order.qty < 1 || !Number.isSafeInteger(order.remaining) || order.remaining < 0) {
      fail('ORDER_QUANTITY', `order ${order.id} has invalid quantities`);
    }
    if (order.status === 'open' && order.remaining === 0) fail('ORDER_STATUS', `order ${order.id} is open with no remainder`);
    if (order.status === 'filled' && order.remaining !== 0) fail('ORDER_STATUS', `order ${order.id} is filled with a remainder`);
  }

  for (const trade of snapshot.trades) {
    const maker = orders.get(trade.makerOrderId);
    const taker = orders.get(trade.takerOrderId);
    if (!maker || !taker) { fail('TRADE_ORDER', `trade ${trade.id} references a missing order`); continue; }
    if (maker.owner !== trade.maker || taker.owner !== trade.taker || maker.marketId !== trade.marketId || taker.marketId !== trade.marketId) {
      fail('TRADE_PARTIES', `trade ${trade.id} parties or market differ from its orders`);
    }
    if (maker.side === taker.side || (maker.side !== 'buy' && maker.side !== 'sell') ||
      (taker.side !== 'buy' && taker.side !== 'sell')) fail('TRADE_SIDES', `trade ${trade.id} has invalid sides`);
    if (!Number.isSafeInteger(trade.qty) || trade.qty < 1 || trade.price !== maker.price) {
      fail('TRADE_PRICE_QTY', `trade ${trade.id} has invalid price or quantity`);
      continue;
    }
    fills.set(maker.id, (fills.get(maker.id) ?? 0) + trade.qty);
    fills.set(taker.id, (fills.get(taker.id) ?? 0) + trade.qty);
    const buyer = maker.side === 'buy' ? maker.owner : taker.owner;
    const seller = maker.side === 'sell' ? maker.owner : taker.owner;
    if (expectedCash.has(buyer)) expectedCash.set(buyer, expectedCash.get(buyer)! - BigInt(trade.qty) * BigInt(trade.price));
    if (expectedCash.has(seller)) expectedCash.set(seller, expectedCash.get(seller)! + BigInt(trade.qty) * BigInt(trade.price));
    expectedQty.set(key(buyer, trade.marketId), (expectedQty.get(key(buyer, trade.marketId)) ?? 0) + trade.qty);
    expectedQty.set(key(seller, trade.marketId), (expectedQty.get(key(seller, trade.marketId)) ?? 0) - trade.qty);
  }

  for (const order of snapshot.orders) {
    if (order.qty !== order.remaining + (fills.get(order.id) ?? 0)) {
      fail('ORDER_FILLS', `order ${order.id} quantity does not equal remainder plus fills`);
    }
  }
  for (const account of snapshot.accounts) {
    if (account.cash !== expectedCash.get(account.owner)) fail('CASH', `account ${account.owner} cash differs from trade replay`);
  }
  const storedQty = new Map<string, number>();
  for (const position of snapshot.positions) {
    const positionKey = key(position.owner, position.marketId);
    storedQty.set(positionKey, (storedQty.get(positionKey) ?? 0) + position.qty);
    if (!accounts.has(position.owner)) fail('POSITION_OWNER', `position ${positionKey} has no account`);
  }
  for (const positionKey of new Set([...expectedQty.keys(), ...storedQty.keys()])) {
    if ((storedQty.get(positionKey) ?? 0) !== (expectedQty.get(positionKey) ?? 0)) {
      fail('POSITION', `position ${positionKey} differs from trade replay`);
    }
  }

  const placements = new Map<number, number>();
  const tradeEvents = new Map<number, number>();
  const cancellations = new Set<number>();
  for (const row of snapshot.events) {
    const event = parseEventLog(row);
    if (!event) { fail('EVENT_PAYLOAD', `event ${row.id} is malformed`); continue; }
    if (event.kind === 'order_placed') {
      placements.set(event.orderId, (placements.get(event.orderId) ?? 0) + 1);
      const order = orders.get(event.orderId);
      if (!order || order.owner !== event.owner || order.marketId !== event.marketId || order.qty !== event.qty) {
        fail('EVENT_ORDER', `placement event ${row.id} differs from order ${event.orderId}`);
      }
    } else if (event.kind === 'trade') {
      tradeEvents.set(event.id, (tradeEvents.get(event.id) ?? 0) + 1);
      const trade = trades.get(event.id);
      if (!trade || trade.price !== event.price || trade.qty !== event.qty || trade.marketId !== event.marketId) {
        fail('EVENT_TRADE', `trade event ${row.id} differs from trade ${event.id}`);
      }
    } else {
      if (!orders.has(event.orderId)) fail('EVENT_ORDER', `event ${row.id} references missing order ${event.orderId}`);
      if (event.kind === 'order_cancelled') cancellations.add(event.orderId);
    }
  }
  for (const order of snapshot.orders) {
    if (placements.get(order.id) !== 1) fail('PLACEMENT_COUNT', `order ${order.id} has ${placements.get(order.id) ?? 0} placements`);
    if (order.status === 'cancelled' && !cancellations.has(order.id)) fail('CANCELLATION', `order ${order.id} has no cancellation event`);
  }
  for (const trade of snapshot.trades) {
    if (tradeEvents.get(trade.id) !== 1) fail('TRADE_EVENT_COUNT', `trade ${trade.id} has ${tradeEvents.get(trade.id) ?? 0} events`);
  }

  for (const alert of snapshot.alerts) {
    if (alert.kind !== 'spoofing') continue;
    let evidence: Record<string, unknown>;
    try { evidence = JSON.parse(alert.evidence) as Record<string, unknown>; }
    catch { fail('ALERT_EVIDENCE', `alert ${alert.id} has invalid JSON`); continue; }
    const layers = evidence.layerOrderIds;
    const cancelled = evidence.cancelledOrderIds;
    const oppositeTradeId = evidence.oppositeTradeId;
    if (!Array.isArray(layers) || !layers.every(id => Number.isSafeInteger(id) && orders.get(id)?.owner === alert.owner && placements.has(id)) ||
      !Array.isArray(cancelled) || !cancelled.every(id => Number.isSafeInteger(id) && orders.get(id)?.owner === alert.owner && cancellations.has(id)) ||
      !Number.isSafeInteger(oppositeTradeId) ||
      (trades.get(oppositeTradeId as number)?.maker !== alert.owner && trades.get(oppositeTradeId as number)?.taker !== alert.owner)) {
      fail('ALERT_EVIDENCE', `alert ${alert.id} references missing order, cancellation, or trade evidence`);
    }
  }
  return issues;
}
