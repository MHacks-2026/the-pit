import type { EngineEvent, MatchResult } from '@the-pit/engine';
// Relative import keeps bots free of a new package dependency; swap for '@the-pit/cop' if the integrator adds it.
import type { CopEvent } from '../../cop/src/index';
import { StreamExchange } from './streamSim';

export { seeded } from './streamSim';

/** StreamExchange that also keeps engine events translated to the Cop's event shape. */
export class Sim extends StreamExchange {
  events: CopEvent[] = [];
  private logId = 1;
  protected override apply(result: MatchResult) {
    for (const e of result.events) this.events.push(...this.toCop(e));
    super.apply(result);
  }
  private toCop(e: EngineEvent): CopEvent[] {
    const logId = this.logId++;
    if (e.kind === 'order_placed') return [{ kind: 'order_placed', logId, owner: e.order.owner, marketId: 1, orderId: e.order.id,
      side: e.order.side, price: e.order.price, qty: e.order.qty, tif: e.order.tif, ts: e.order.ts }];
    if (e.kind === 'order_cancelled') return [{ kind: 'order_cancelled', logId, owner: e.owner, marketId: 1, orderId: e.orderId, ts: e.ts }];
    if (e.kind === 'trade') return [{ kind: 'trade', logId, ...e.trade }];
    if (e.kind === 'self_trade_attempt') return [{ kind: 'self_trade_attempt', logId, owner: e.owner, marketId: 1, orderId: e.orderId, ts: e.ts }];
    return [];
  }
}
