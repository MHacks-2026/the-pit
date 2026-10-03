export type { NewOrder, Side, Tif } from '@the-pit/engine';

/** Injected random source in [0, 1). Bots never call Math.random() directly. */
export type Rng = () => number;
