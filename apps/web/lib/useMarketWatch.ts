'use client';

import { useEffect, useState } from 'react';
import { marketWatch, type MarketEvent, type MarketWatch } from '@the-pit/cop';
import { BITSTAMP_WS, bitstampSubscriptions, parseBitstamp } from './bitstamp';

export type WatchStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'unavailable';

const WINDOW_MS = 60_000;

/**
 * Connects the browser straight to Bitstamp's public feed (no server, no key), keeps the last minute of events and
 * recomputes the Cop's market watch once a second. Time is the exchange's own clock (the newest event), so a skewed
 * laptop clock cannot hide fresh events. Reconnects every 5 s if the feed drops; shows 'unavailable' if it never opens.
 */
export function useMarketWatch(enabled: boolean): { status: WatchStatus; watch: MarketWatch | null } {
  const [state, setState] = useState<{ status: WatchStatus; watch: MarketWatch | null }>(
    { status: enabled ? 'connecting' : 'off', watch: null });

  useEffect(() => {
    if (!enabled) return;
    const buffer: MarketEvent[] = [];
    let socket: WebSocket | null = null;
    let everOpened = false;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let exchangeNow = 0;
    let referencePrice: number | undefined;

    const connect = () => {
      socket = new WebSocket(BITSTAMP_WS);
      socket.onopen = () => {
        everOpened = true;
        for (const frame of bitstampSubscriptions()) socket?.send(frame);
      };
      socket.onmessage = message => {
        try {
          const event = parseBitstamp(JSON.parse(String(message.data)));
          if (!event) return;
          buffer.push(event);
          exchangeNow = Math.max(exchangeNow, event.ts);
        } catch { /* ignore malformed frames */ }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (closed) return;
        setState(previous => ({ ...previous, status: everOpened ? 'reconnecting' : 'unavailable' }));
        retry = setTimeout(connect, 5_000);
      };
    };
    connect();

    const tick = setInterval(() => {
      // Drop events older than the window, remembering the last trade price as the reference for quiet minutes.
      while (buffer.length && buffer[0].ts <= exchangeNow - WINDOW_MS - 5_000) {
        const old = buffer.shift()!;
        if (old.kind === 'trade') referencePrice = old.price;
      }
      if (!exchangeNow) return;
      const live = socket?.readyState === WebSocket.OPEN;
      setState({ status: live ? 'live' : everOpened ? 'reconnecting' : 'unavailable',
        watch: marketWatch(buffer, exchangeNow, { windowMs: WINDOW_MS, referencePrice }) });
    }, 1_000);

    return () => {
      closed = true;
      clearInterval(tick);
      clearTimeout(retry);
      socket?.close();
    };
  }, [enabled]);

  return state;
}
