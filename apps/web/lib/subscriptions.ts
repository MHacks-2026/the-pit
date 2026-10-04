'use client';

// Filtered live subscriptions: each screen downloads only the rows it renders, not the exchange's whole history.
// The order book needs open orders; the tape and chart need recent trades; the tape's buy/sell colour needs the
// taker's order, which is already filled, so recent orders are subscribed too. useTable re-subscribes when the
// filter's SQL changes, so the cutoff rolls forward every CUTOFF_STEP_MS and a page left open stays bounded.

import { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'spacetimedb';
import { useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';

export const PHONE_TRADES_WINDOW_MS = 10 * 60_000;
export const SCREEN_TRADES_WINDOW_MS = 30 * 60_000;
export const TAPE_ORDERS_WINDOW_MS = 2 * 60_000;
const CUTOFF_STEP_MS = 60_000;

/** now - windowMs, floored to the step so the query (and its subscription) only changes once per step. */
export function cutoffFor(nowMs: number, windowMs: number, stepMs = CUTOFF_STEP_MS): number {
  return Math.floor((nowMs - windowMs) / stepMs) * stepMs;
}

export function useRecentCutoff(windowMs: number): Timestamp {
  const [cutoff, setCutoff] = useState(() => cutoffFor(Date.now(), windowMs));
  useEffect(() => {
    const timer = setInterval(() => setCutoff(cutoffFor(Date.now(), windowMs)), 10_000);
    return () => clearInterval(timer);
  }, [windowMs]);
  return useMemo(() => Timestamp.fromDate(new Date(cutoff)), [cutoff]);
}

/** Open orders only: everything the order book and "my open orders" need. */
export function useOpenOrders() {
  return useTable(tables.order.where(r => r.status.eq('open')));
}

export function useRecentTrades(windowMs: number) {
  const cutoff = useRecentCutoff(windowMs);
  return useTable(tables.trade.where(r => r.ts.gte(cutoff)));
}

/** Open orders plus orders placed in the last few minutes (so recent tape rows can show the taker's side). */
export function useOpenAndRecentOrders(windowMs = TAPE_ORDERS_WINDOW_MS) {
  const [open, openReady] = useOpenOrders();
  const cutoff = useRecentCutoff(windowMs);
  const [recent, recentReady] = useTable(tables.order.where(r => r.ts.gte(cutoff)));
  const merged = useMemo(() => {
    const byId = new Map(recent.map(row => [row.id, row]));
    for (const row of open) byId.set(row.id, row);
    return [...byId.values()];
  }, [open, recent]);
  return [merged, openReady && recentReady] as const;
}
