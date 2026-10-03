export type Side = "BUY" | "SELL";

export type OrderType = "LIMIT" | "IOC" | "MARKET";

export type Order = {
  id: string;
  side: Side;
  price: number;
  qty: number;
  tag?: string;
};

export type BookLevel = {
  price: number;
  qty: number;
};

export type BookSnapshot = {
  bids: BookLevel[];
  asks: BookLevel[];
  midPrice: number;
  lastTradePrice?: number;
};

export type NewsItem = {
  timestamp: number;
  text: string;
  signal: number;
};

export type Observation = {
  now: number;

  book: BookSnapshot;

  me: {
    cash: number;
    position: number;
    openOrders: Order[];
  };

  news?: NewsItem[];

  rng: () => number;
};

export type PlaceAction = {
  kind: "place";
  side: Side;
  price: number;
  qty: number;
  type: OrderType;
  tag?: string;
};

export type CancelAction = {
  kind: "cancel";
  orderId: string;
};

export type Action = PlaceAction | CancelAction;

export type StrategyResult<S> = {
  actions: Action[];
  state: S;
};

export type Strategy<S, P> = (
  obs: Observation,
  params: P,
  state: S
) => StrategyResult<S>;