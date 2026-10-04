'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '@the-pit/bindings';
import { HACK_MARKET_ID, LiveProvider } from '../../lib/live';
import { PHONE_TRADES_WINDOW_MS, useOpenOrders, useRecentTrades } from '../../lib/subscriptions';
import BeatTheCop from './BeatTheCop';
import CitationCard from './CitationCard';

const MAX_ORDER_QTY = 50;

type Side = 'buy' | 'sell';

function TradeInner() {
  const { identity, connectionError } = useSpacetimeDB();
  const [accounts, accountsReady] = useTable(tables.account);
  const [positions] = useTable(tables.position);
  // Filtered: the phone needs open orders and the last price, not the whole history.
  const [orders] = useOpenOrders();
  const [trades, tradesReady] = useRecentTrades(PHONE_TRADES_WINDOW_MS);
  const placeOrder = useReducer(reducers.placeOrder);
  const cancelOrder = useReducer(reducers.cancelOrder);

  const [price, setPrice] = useState(100);
  const [priceSet, setPriceSet] = useState(false);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myHex = identity ? identity.toHexString() : null;

  const view = useMemo(() => {
    const me = myHex ? accounts.find(a => a.identity.toHexString() === myHex) : undefined;
    const position = positions.find(p => p.owner.toHexString() === myHex && p.marketId === HACK_MARKET_ID)?.qty ?? 0;
    const open = orders.filter(o => o.marketId === HACK_MARKET_ID && o.status === 'open' && o.remaining > 0);
    const bids = open.filter(o => o.side === 'buy').map(o => o.price);
    const asks = open.filter(o => o.side === 'sell').map(o => o.price);
    const marketTrades = trades
      .filter(t => t.marketId === HACK_MARKET_ID)
      .sort((a, b) => (a.ts.microsSinceUnixEpoch < b.ts.microsSinceUnixEpoch ? -1 : 1));
    const lastPrice = marketTrades.length ? marketTrades[marketTrades.length - 1].price : null;
    const mine = open
      .filter(o => o.owner.toHexString() === myHex)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return {
      me,
      position,
      lastPrice,
      bestBid: bids.length ? Math.max(...bids) : null,
      bestAsk: asks.length ? Math.min(...asks) : null,
      mine,
    };
  }, [accounts, positions, orders, trades, myHex]);

  // Start the price stepper at the last trade price, once.
  useEffect(() => {
    if (!priceSet && tradesReady && view.lastPrice !== null) {
      setPrice(view.lastPrice);
      setPriceSet(true);
    }
  }, [priceSet, tradesReady, view.lastPrice]);

  async function submit(side: Side) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await placeOrder({ marketId: HACK_MARKET_ID, side, price, qty, tif: 'GTC' });
      setMessage(`Order sent: ${side} ${qty} at ${price}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order rejected');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(orderId: bigint) {
    setError(null);
    setMessage(null);
    try {
      await cancelOrder({ orderId });
      setMessage('Order canceled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t cancel the order');
    }
  }

  const mid = view.bestBid !== null && view.bestAsk !== null ? (view.bestBid + view.bestAsk) / 2 : (view.lastPrice ?? 100);

  if (connectionError) {
    return <p className="join-error" role="alert">Couldn’t reach the exchange. Check your connection and refresh.</p>;
  }
  if (!identity || !accountsReady) {
    return <p className="state" role="status">Loading your trader desk…</p>;
  }
  if (!view.me) {
    return (
      <div className="join-success">
        <p className="join-status" role="status">You haven’t joined yet.</p>
        <Link className="join-button" href="/join">Join the Pit</Link>
      </div>
    );
  }

  return (
    <div className="trade-panel">
      <p className="trade-who">Trading as <strong>{view.me.name}</strong></p>
      <dl className="trade-stats">
        <div><dt>Net worth</dt><dd>{Math.round(Number(view.me.cash) + view.position * mid).toLocaleString('en-US')}</dd></div>
        <div>
          <dt>Profit</dt>
          <dd className={Number(view.me.cash) + view.position * mid - 10_000 >= 0 ? 'up' : 'down'}>
            {Number(view.me.cash) + view.position * mid - 10_000 >= 0 ? '+' : '−'}{Math.abs(Math.round(Number(view.me.cash) + view.position * mid - 10_000)).toLocaleString('en-US')}
          </dd>
        </div>
        <div><dt>Cash</dt><dd>{Number(view.me.cash).toLocaleString('en-US')}</dd></div>
        <div><dt>Position</dt><dd>{view.position}</dd></div>
        <div><dt>Last price</dt><dd>{view.lastPrice ?? '–'}</dd></div>
        <div><dt>Bid / Ask</dt><dd>{view.bestBid ?? '–'} / {view.bestAsk ?? '–'}</dd></div>
      </dl>

      <div className="trade-steppers">
        <div className="stepper">
          <span className="join-label" id="price-label">Price</span>
          <div className="stepper-row" role="group" aria-labelledby="price-label">
            <button className="stepper-button" type="button" aria-label="Decrease price" onClick={() => setPrice(Math.max(1, price - 1))}>−</button>
            <output className="stepper-value">{price}</output>
            <button className="stepper-button" type="button" aria-label="Increase price" onClick={() => setPrice(price + 1)}>+</button>
          </div>
        </div>
        <div className="stepper">
          <span className="join-label" id="qty-label">Quantity</span>
          <div className="stepper-row" role="group" aria-labelledby="qty-label">
            <button className="stepper-button" type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <output className="stepper-value">{qty}</output>
            <button className="stepper-button" type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(MAX_ORDER_QTY, qty + 1))}>+</button>
          </div>
        </div>
      </div>

      <p className="join-hint">Order value: {(price * qty).toLocaleString('en-US')} play dollars</p>

      <div className="trade-actions">
        <button className="trade-button trade-buy" type="button" disabled={busy} onClick={() => submit('buy')}><span className="tb-label"><svg className="tb-arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2.5 12.5 11.5H1.5Z" fill="currentColor" /></svg>Buy</span><span className="tb-sub">{qty} @ {price}</span></button>
        <button className="trade-button trade-sell" type="button" disabled={busy} onClick={() => submit('sell')}><span className="tb-label"><svg className="tb-arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11.5 1.5 2.5H12.5Z" fill="currentColor" /></svg>Sell</span><span className="tb-sub">{qty} @ {price}</span></button>
      </div>

      {error ? <p className="join-error" role="alert">{error}</p> : null}
      {message ? <p className="join-status" role="status">{message}</p> : null}

      <h3 className="trade-orders-title">Open orders</h3>
      {view.mine.length === 0 ? (
        <p className="join-hint">No open orders. Orders that don’t match right away wait here.</p>
      ) : (
        <ul className="trade-orders">
          {view.mine.map(order => (
            <li className="trade-order" key={order.id.toString()}>
              <span className={order.side === 'buy' ? 'up' : 'down'}>{order.side === 'buy' ? 'Buy' : 'Sell'}</span>
              <span>{order.remaining} @ {order.price}</span>
              <button className="join-button" type="button" onClick={() => cancel(order.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      )}

      <BeatTheCop myHex={myHex ?? ''} cash={Number(view.me.cash)} position={view.position} mid={mid} lastPrice={view.lastPrice} bestAsk={view.bestAsk} />

      <CitationCard myHex={myHex ?? ''} name={view.me.name} />
    </div>
  );
}

export default function TradePanel() {
  return (
    <LiveProvider>
      <TradeInner />
    </LiveProvider>
  );
}
