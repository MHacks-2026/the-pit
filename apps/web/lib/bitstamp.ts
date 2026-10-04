import type { MarketEvent } from '@the-pit/cop';

// Bitstamp's public WebSocket (no key): live_orders_<pair> streams every order created, changed and deleted with its id;
// live_trades_<pair> streams trades with the buy and sell order ids. We map both into the Cop's MarketEvent shape.

export const BITSTAMP_WS = 'wss://ws.bitstamp.net';
export const BITSTAMP_PAIR = 'btcusd';

export function bitstampSubscriptions(pair = BITSTAMP_PAIR): string[] {
  return [`live_orders_${pair}`, `live_trades_${pair}`].map(channel => JSON.stringify({ event: 'bts:subscribe', data: { channel } }));
}

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** One Bitstamp message -> a MarketEvent, or null for anything else (subscription acks, malformed rows). */
export function parseBitstamp(raw: unknown): MarketEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const { event, channel, data } = raw as { event?: unknown; channel?: unknown; data?: Record<string, unknown> };
  if (typeof channel !== 'string' || !data || typeof data !== 'object') return null;
  const micros = num(data.microtimestamp);
  if (micros === null) return null;
  const ts = micros / 1000;
  if (channel.startsWith('live_trades_') && event === 'trade') {
    const price = num(data.price);
    const amount = num(data.amount);
    if (price === null || amount === null || data.buy_order_id === undefined || data.sell_order_id === undefined) return null;
    return { kind: 'trade', id: String(data.id), price, amount, buyOrderId: String(data.buy_order_id),
      sellOrderId: String(data.sell_order_id), ts };
  }
  if (!channel.startsWith('live_orders_')) return null;
  const id = typeof data.id_str === 'string' ? data.id_str : data.id !== undefined ? String(data.id) : null;
  const side = data.order_type === 0 ? 'buy' : data.order_type === 1 ? 'sell' : null;
  const price = num(data.price);
  const amount = num(data.amount_at_create ?? data.amount);
  if (id === null || side === null || price === null || amount === null) return null;
  if (event === 'order_created') return { kind: 'created', id, side, price, amount, ts };
  const traded = num(data.amount_traded) ?? 0;
  if (event === 'order_changed') return { kind: 'changed', id, side, price, amount, traded, ts };
  if (event === 'order_deleted') return { kind: 'deleted', id, side, price, amount, traded, ts };
  return null;
}
