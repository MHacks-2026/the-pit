'use client';

import { useEffect, useState } from 'react';
import { LIMITS, mockPitClient, type Side, type TraderState } from '../../lib/pit-client';

export default function TradePanel() {
  const [state, setState] = useState<TraderState | null>(null);
  const [price, setPrice] = useState(100);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mockPitClient.getState().then(next => {
      setState(next);
      setPrice(next.lastPrice);
    });
  }, []);

  async function submit(side: Side) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await mockPitClient.placeOrder(side, price, qty);
      setState(result.state);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order rejected');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(orderId: number) {
    setError(null);
    setMessage(null);
    setState(await mockPitClient.cancelOrder(orderId));
  }

  if (!state) {
    return <p className="feed-state" role="status">Loading your trader desk…</p>;
  }

  return (
    <div className="trade-panel">
      <dl className="trade-stats">
        <div><dt>Cash</dt><dd>{state.cash.toLocaleString('en-US')}</dd></div>
        <div><dt>Position</dt><dd>{state.position}</dd></div>
        <div><dt>Last</dt><dd>{state.lastPrice}</dd></div>
        <div><dt>Bid / Ask</dt><dd>{state.bestBid} / {state.bestAsk}</dd></div>
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
            <button className="stepper-button" type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(LIMITS.maxOrderQty, qty + 1))}>+</button>
          </div>
        </div>
      </div>

      <p className="join-hint">Order value: {(price * qty).toLocaleString('en-US')} play dollars</p>

      <div className="trade-actions">
        <button className="trade-button trade-buy" type="button" disabled={busy} onClick={() => submit('buy')}>Buy</button>
        <button className="trade-button trade-sell" type="button" disabled={busy} onClick={() => submit('sell')}>Sell</button>
      </div>

      {error ? <p className="join-error" role="alert">{error}</p> : null}
      {message ? <p className="join-status" role="status">{message}</p> : null}

      <h3 className="trade-orders-title">Open orders</h3>
      {state.openOrders.length === 0 ? (
        <p className="join-hint">No open orders. Orders that do not match right away wait here.</p>
      ) : (
        <ul className="trade-orders">
          {state.openOrders.map(order => (
            <li className="trade-order" key={order.id}>
              <span className={order.side === 'buy' ? 'order-buy' : 'order-sell'}>{order.side.toUpperCase()}</span>
              <span>{order.qty} @ {order.price}</span>
              <button className="join-button" type="button" onClick={() => cancel(order.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
