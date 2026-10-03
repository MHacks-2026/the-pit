// Mock PitClient for the web skeleton (T06). State lives in memory and resets on refresh.
// Later, swap mockPitClient for a SpacetimeDB-backed client with the same interface.

export interface JoinedAccount {
  name: string;
  cash: number;
}

export type Side = 'buy' | 'sell';

export interface OpenOrder {
  id: number;
  side: Side;
  price: number;
  qty: number;
}

export interface TraderState {
  cash: number;
  position: number;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  openOrders: OpenOrder[];
}

export interface OrderResult {
  message: string;
  state: TraderState;
}

export interface PitClient {
  join(name: string): Promise<JoinedAccount>;
  getState(): Promise<TraderState>;
  placeOrder(side: Side, price: number, qty: number): Promise<OrderResult>;
  cancelOrder(orderId: number): Promise<TraderState>;
}

// Risk limits from docs/spec.md section 1.
export const LIMITS = {
  maxOrderQty: 50,
  maxOpenOrders: 20,
  positionLimit: 200,
  priceBand: 0.2,
};

// ---- Mock market (in memory, resets on page refresh) ----
const mock = {
  cash: 10_000,
  position: 0,
  lastPrice: 100,
  nextId: 1,
  openOrders: [] as OpenOrder[],
};

function snapshot(): TraderState {
  return {
    cash: mock.cash,
    position: mock.position,
    lastPrice: mock.lastPrice,
    bestBid: mock.lastPrice - 1,
    bestAsk: mock.lastPrice + 1,
    openOrders: mock.openOrders.map(order => ({ ...order })),
  };
}

export const mockPitClient: PitClient = {
  async join(name) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 32) {
      throw new Error('name must be 1 to 32 characters');
    }
    return { name: cleanName, cash: 10_000 };
  },

  async getState() {
    return snapshot();
  },

  async placeOrder(side, price, qty) {
    if (!Number.isInteger(price) || !Number.isInteger(qty)) {
      throw new Error('price and quantity must be whole numbers');
    }
    if (qty < 1 || qty > LIMITS.maxOrderQty) {
      throw new Error(`quantity must be 1 to ${LIMITS.maxOrderQty}`);
    }
    const minPrice = Math.ceil(mock.lastPrice * (1 - LIMITS.priceBand));
    const maxPrice = Math.floor(mock.lastPrice * (1 + LIMITS.priceBand));
    if (price < minPrice || price > maxPrice) {
      throw new Error(`price must be ${minPrice} to ${maxPrice} (within 20% of the last trade)`);
    }
    if (mock.openOrders.length >= LIMITS.maxOpenOrders) {
      throw new Error(`too many open orders (max ${LIMITS.maxOpenOrders})`);
    }
    const resulting = side === 'buy' ? mock.position + qty : mock.position - qty;
    if (Math.abs(resulting) > LIMITS.positionLimit) {
      throw new Error(`position limit is plus or minus ${LIMITS.positionLimit}`);
    }
    if (side === 'buy') {
      const reserved = mock.openOrders
        .filter(order => order.side === 'buy')
        .reduce((sum, order) => sum + order.price * order.qty, 0);
      if (price * qty > mock.cash - reserved) {
        throw new Error('not enough cash for this buy');
      }
    }

    const bestBid = mock.lastPrice - 1;
    const bestAsk = mock.lastPrice + 1;
    const crosses = side === 'buy' ? price >= bestAsk : price <= bestBid;

    if (crosses) {
      const fillPrice = side === 'buy' ? bestAsk : bestBid;
      mock.cash += side === 'buy' ? -fillPrice * qty : fillPrice * qty;
      mock.position = resulting;
      mock.lastPrice = fillPrice;
      return {
        message: `Filled: ${side} ${qty} at ${fillPrice}`,
        state: snapshot(),
      };
    }

    mock.openOrders.push({ id: mock.nextId++, side, price, qty });
    return {
      message: `Order placed: ${side} ${qty} at ${price}`,
      state: snapshot(),
    };
  },

  async cancelOrder(orderId) {
    mock.openOrders = mock.openOrders.filter(order => order.id !== orderId);
    return snapshot();
  },
};
