'use client';

import { useMarketWatch } from '../../lib/useMarketWatch';

const ENABLED = process.env.NEXT_PUBLIC_MARKET_WATCH !== 'false';

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (share: number | null) => (share === null ? '–' : `${(share * 100).toFixed(1)}%`);

/** The Cop's warning signs on a real exchange: live BTC/USD order flow from Bitstamp's public feed. */
export default function MarketWatchPanel() {
  const { status, watch } = useMarketWatch(ENABLED);
  if (!ENABLED) return null;

  if (!watch) {
    return <p className="state" role="status">
      {status === 'unavailable' ? 'The live Bitstamp feed is unavailable from this network.' : 'Connecting to live BTC/USD order flow…'}
    </p>;
  }

  return (
    <div className="watch" aria-label="Real market watch">
      <p className="watch-status">
        <span className="live"><span className={status === 'live' ? 'live-dot' : 'live-dot live-dot-off'} aria-hidden="true" />{status === 'live' ? 'Live' : 'Reconnecting'}</span>
        BTC/USD on Bitstamp, last 60 seconds
      </p>
      <dl className="watch-stats">
        <div><dt>Orders / s</dt><dd>{watch.perSecond.orders}</dd></div>
        <div><dt>Cancels / s</dt><dd>{watch.perSecond.cancels}</dd></div>
        <div><dt>Trades / s</dt><dd>{watch.perSecond.trades}</dd></div>
        <div><dt>Cancelled without trading</dt><dd>{pct(watch.cancelledUntradedShare)}</dd></div>
        <div><dt>Last price</dt><dd>{watch.referencePrice === null ? '–' : `$${usd(watch.referencePrice)}`}</dd></div>
        <div><dt>Flash orders</dt><dd>{watch.flashOrders.length}</dd></div>
      </dl>
      <h3>Flash orders: big, near the price, gone within 5 seconds, never filled</h3>
      {watch.flashOrders.length === 0 ? <p className="quiet">None in the last minute.</p> : (
        <ul className="rows">
          {watch.flashOrders.map(order => (
            <li key={order.id} className="flash-row">
              <span className={order.side === 'buy' ? 'up' : 'down'}>{order.side === 'buy' ? 'Bid' : 'Ask'} ${usd(order.price)}</span>
              <span>{order.amount} BTC ({order.sizeMultiple}x median), {order.distanceBps} bp from price</span>
              <time>lived {(order.livedMs / 1000).toFixed(1)} s</time>
            </li>
          ))}
        </ul>
      )}
      <p className="quiet watch-note">
        Public feeds show order ids, never who placed them, so this cannot accuse anyone. Most flash orders are ordinary
        market makers updating quotes; a spoofer looks the same from outside. Telling them apart needs the account behind
        each order, which exchanges have and which is exactly what the Cop&apos;s full rule uses.
      </p>
    </div>
  );
}
