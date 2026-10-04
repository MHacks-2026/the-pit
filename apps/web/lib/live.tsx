'use client';

// Shared live connection for every page (T13).
// The database gives every browser a secret token. We save it in localStorage so
// /join and /trade (and a page refresh) are the same trader.
// SpacetimeDB's React provider shares ONE connection per database across the page, and the first provider to mount
// wins. So every provider (ticker, board, alert feed, trade panel) must build its connection the same way, with the
// saved token; otherwise an anonymous ticker connection would be reused and /trade would forget who joined.

import { ReactNode, useMemo } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '@the-pit/bindings';

export const HACK_MARKET_ID = 1;
const TOKEN_KEY = 'the-pit-token';

function loadToken(): string | undefined {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: we just get a fresh identity next time */
  }
}

/** The one way to connect: saved token in, fresh token saved on connect. */
export function liveConnectionBuilder(uri: string, database: string) {
  return DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database)
    .withToken(typeof window === 'undefined' ? undefined : loadToken())
    .onConnect((_conn, _identity, token) => saveToken(token));
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => {
    if (!validUri || !database) return null;
    return liveConnectionBuilder(uri, database);
  }, [uri, database, validUri]);

  if (!connectionBuilder) {
    return (
      <p className="state" role="alert">
        The live exchange is not configured. Set a public wss:// NEXT_PUBLIC_SPACETIME_URI and NEXT_PUBLIC_SPACETIME_DB, then redeploy.
      </p>
    );
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{children}</SpacetimeDBProvider>;
}
