import { expect, it } from 'vitest';
import { marketMaker } from './marketMaker';
import type { Observation } from './types';

it('emits integer quotes and returns fresh state without changing the input', () => {
  const observation: Observation = {
    now: 1,
    book: { bids: [], asks: [], midPrice: 100 },
    me: { cash: 10_000, position: 0, openOrders: [] },
    rng: () => 0.5,
  };
  const params = { gamma: 0.1, k: 2, volatilityWindow: 3, tickSize: 1,
    maxInventory: 10, requoteThreshold: 1, orderSize: 2 };
  const state = { midHistory: [99] };
  const result = marketMaker(observation, params, state);
  expect(result.actions).toHaveLength(2);
  expect(result.actions.every(action => action.kind === 'place' && Number.isInteger(action.price))).toBe(true);
  expect(result.state.midHistory).toEqual([99, 100]);
  expect(state.midHistory).toEqual([99]);
});
