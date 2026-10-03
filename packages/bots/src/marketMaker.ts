import {
  Observation,
  Action,
  StrategyResult,
} from "./types";

export type MarketMakerParams = {
  gamma: number;
  k: number;
  volatilityWindow: number;
  tickSize: number;
  maxInventory: number;
  requoteThreshold: number;
  orderSize: number;
};

export type MarketMakerState = {
  midHistory: number[];

  lastBidPrice?: number;
  lastAskPrice?: number;
};

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) {
    return 0;
  }

  const returns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const previous = prices[i - 1];
    const current = prices[i];

    if (previous === 0) {
      continue;
    }

    returns.push((current - previous) / previous);
  }

  if (returns.length === 0) {
    return 0;
  }

  const mean =
    returns.reduce((sum, x) => sum + x, 0) / returns.length;

  const variance =
    returns.reduce(
      (sum, x) => sum + (x - mean) ** 2,
      0
    ) / returns.length;

  return Math.sqrt(variance);
}

function reservationPrice(
  mid: number,
  inventory: number,
  gamma: number,
  volatility: number
): number {
  return mid - inventory * gamma * volatility ** 2;
}

function calculateSpread(
  gamma: number,
  k: number,
  volatility: number
): number {
  return (
    gamma * volatility ** 2 +
    (2 / gamma) * Math.log(1 + gamma / k)
  );
}

function roundToTick(
  price: number,
  tickSize: number
): number {
  return Math.round(price / tickSize) * tickSize;
}

function shouldRequote(
  newBid: number,
  newAsk: number,
  state: MarketMakerState,
  threshold: number
): boolean {
  if (
    state.lastBidPrice === undefined ||
    state.lastAskPrice === undefined
  ) {
    return true;
  }

  const bidMoved =
    Math.abs(newBid - state.lastBidPrice) >= threshold;

  const askMoved =
    Math.abs(newAsk - state.lastAskPrice) >= threshold;

  return bidMoved || askMoved;
}

export function marketMaker(
  obs: Observation,
  params: MarketMakerParams,
  state: MarketMakerState
): StrategyResult<MarketMakerState> {

  const mid = obs.book.midPrice;

  const nextState: MarketMakerState = {
    ...state,
    midHistory: [...state.midHistory, mid],
  };

  if (
    nextState.midHistory.length >
    params.volatilityWindow
  ) {
    nextState.midHistory.shift();
  }

  const volatility =
    calculateVolatility(nextState.midHistory);

  const reservation =
    reservationPrice(
      mid,
      obs.me.position,
      params.gamma,
      volatility
    );

  const spread =
    calculateSpread(
      params.gamma,
      params.k,
      volatility
    );

  const bidPrice =
    roundToTick(
      reservation - spread,
      params.tickSize
    );

  const askPrice =
    roundToTick(
      reservation + spread,
      params.tickSize
    );

  const actions: Action[] = [];

  const requote = shouldRequote(
    bidPrice,
    askPrice,
    nextState,
    params.requoteThreshold
  );

  if (!requote) {
    return {
      actions,
      state: nextState
    };
  }

  // Cancel existing market-maker orders.
  for (const order of obs.me.openOrders) {
    if (order.tag === "market-maker") {
      actions.push({
        kind: "cancel",
        orderId: order.id
      });
    }
  }

  // Place bid if inventory allows.
  if (obs.me.position < params.maxInventory) {
    actions.push({
      kind: "place",
      side: "BUY",
      price: bidPrice,
      qty: params.orderSize,
      type: "LIMIT",
      tag: "market-maker"
    });
  }

  // Place ask if inventory allows.
  if (obs.me.position > -params.maxInventory) {
    actions.push({
      kind: "place",
      side: "SELL",
      price: askPrice,
      qty: params.orderSize,
      type: "LIMIT",
      tag: "market-maker"
    });
  }

  nextState.lastBidPrice = bidPrice;
  nextState.lastAskPrice = askPrice;

  return {
    actions,
    state: nextState
  };
}
