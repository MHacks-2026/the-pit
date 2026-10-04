import { describe, expect, it } from 'vitest';
import { marketWatch } from '@the-pit/cop';
import { bitstampSubscriptions, parseBitstamp } from './bitstamp';

// Shapes copied from the live feed (2026-10-04), trimmed.
const created = { channel: 'live_orders_btcusd', event: 'order_created', data: { id: 2057290840182785, id_str: '2057290840182785',
  order_type: 0, microtimestamp: '1791103246186000', amount: 0.0013147, amount_traded: '0', amount_at_create: '0.00131470', price: 76547.23 } };
const deleted = { channel: 'live_orders_btcusd', event: 'order_deleted', data: { id: 2057290838953986, id_str: '2057290838953986',
  order_type: 1, microtimestamp: '1791103246198000', amount: 0.0829223, amount_traded: '0', amount_at_create: '0.08292230', price: 85058.16 } };
const changed = { channel: 'live_orders_btcusd', event: 'order_changed', data: { id: 2057290838630404, id_str: '2057290838630404',
  order_type: 0, microtimestamp: '1791103246607000', amount: 0.19591878, amount_traded: '0.00005941', amount_at_create: '0.19597819', price: 85052.47 } };
const trade = { channel: 'live_trades_btcusd', event: 'trade', data: { id: 648789486, amount: 0.00005941, price: 85052.47, type: 1,
  microtimestamp: '1791103246607000', buy_order_id: 2057290838630404, sell_order_id: 2057290841903106 } };

describe('parseBitstamp', () => {
  it('maps orders and trades from the live feed', () => {
    expect(parseBitstamp(created)).toEqual({ kind: 'created', id: '2057290840182785', side: 'buy', price: 76547.23, amount: 0.0013147, ts: 1791103246186 });
    expect(parseBitstamp(deleted)).toEqual({ kind: 'deleted', id: '2057290838953986', side: 'sell', price: 85058.16, amount: 0.0829223, traded: 0, ts: 1791103246198 });
    expect(parseBitstamp(changed)).toMatchObject({ kind: 'changed', side: 'buy', amount: 0.19597819, traded: 0.00005941 });
    expect(parseBitstamp(trade)).toEqual({ kind: 'trade', id: '648789486', price: 85052.47, amount: 0.00005941,
      buyOrderId: '2057290838630404', sellOrderId: '2057290841903106', ts: 1791103246607 });
  });

  it('ignores acks and malformed messages', () => {
    for (const raw of [null, 'x', { event: 'bts:subscription_succeeded', channel: 'live_orders_btcusd', data: {} },
      { ...created, data: { ...created.data, order_type: 7 } }, { ...trade, data: { ...trade.data, price: 'abc' } },
      { channel: 'other', event: 'order_created', data: created.data }]) {
      expect(parseBitstamp(raw)).toBeNull();
    }
  });

  it('builds subscribe frames and feeds the Cop market watch end to end', () => {
    expect(bitstampSubscriptions().map(s => JSON.parse(s).data.channel)).toEqual(['live_orders_btcusd', 'live_trades_btcusd']);
    const events = [created, deleted, changed, trade].map(parseBitstamp).filter(e => e !== null);
    expect(marketWatch(events, 1791103247000)).toMatchObject({ created: 1, cancelled: 1, trades: 1, referencePrice: 85052.47 });
  });
});
