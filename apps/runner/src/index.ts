import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbConnection } from '@the-pit/bindings';
import { informedOrder, marketMakerQuotes, noiseOrder, stepWorld, worldNews, type WorldState } from '@the-pit/bots';
import { detectSpoofing, parseEventLog } from '@the-pit/cop';

const host = process.env.NEXT_PUBLIC_SPACETIME_URI || 'ws://127.0.0.1:3000';
const database = process.env.NEXT_PUBLIC_SPACETIME_DB || 'the-pit-local';
const adminToken = process.env.ADMIN_TOKEN;
const botCount = Number(process.env.PIT_BOT_COUNT || 3);
const seed = Number(process.env.PIT_SEED || 2026);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const tokenFile = resolve(repoRoot, process.env.PIT_RUNNER_TOKEN_FILE || '.tools/runner-tokens.json');

if (!adminToken) throw new Error('ADMIN_TOKEN is required to register bot identities and post news');
if (!Number.isSafeInteger(botCount) || botCount < 1 || botCount > 20) throw new Error('PIT_BOT_COUNT must be 1 to 20');
if (!Number.isSafeInteger(seed)) throw new Error('PIT_SEED must be an integer');

let randomState = seed >>> 0;
const rng = () => ((randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32);
const clock = () => Date.now();

type TokenStore = Record<string, Record<string, string>>;
let tokens: TokenStore = {};
try {
  tokens = JSON.parse(await readFile(tokenFile, 'utf8')) as TokenStore;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
tokens[database] ??= {};

async function saveTokens(): Promise<void> {
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, JSON.stringify(tokens), { mode: 0o600 });
}

async function connect(name: string, token?: string): Promise<DbConnection> {
  return new Promise((resolveConnection, reject) => {
    const builder = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((connection, _identity, issuedToken) => {
        if (name !== 'admin') {
          tokens[database][name] = issuedToken;
          void saveTokens().catch(reject);
        }
        connection.subscriptionBuilder()
          .onApplied(() => resolveConnection(connection))
          .onError(error => reject(error))
          .subscribeToAllTables();
      })
      .onConnectError(reject);
    builder.build();
  });
}

const admin = await connect('admin', adminToken);
const names = ['market-maker', ...Array.from({ length: botCount }, (_, index) => `noise-${index + 1}`), 'informed'];
const bots = new Map<string, DbConnection>();
for (const name of names) {
  const connection = await connect(name, tokens[database][name]);
  await admin.reducers.adminRegisterBot({ identity: connection.identity!, name });
  bots.set(name, connection);
}
console.info(`Runner connected ${bots.size} bot identities to ${database}`);

let world: WorldState = { fundamental: 100, now: clock() };
const pendingNews: ReturnType<typeof worldNews>[] = [];
const pendingAlerts = new Set<string>();
const lastBotError = new Map<string, string>();
let lastNews = world.now;
let busy = false;

async function placeBotOrder(name: string, bot: DbConnection, order: NonNullable<ReturnType<typeof noiseOrder>> | null): Promise<void> {
  if (!order) return;
  try {
    const owner = bot.identity!.toHexString();
    const openCount = [...bot.db.order.iter()].filter(row => row.owner.toHexString() === owner && row.status === 'open').length;
    if (openCount >= 18) await bot.reducers.cancelAll({});
    await bot.reducers.placeOrder({ marketId: order.marketId, side: order.side, price: order.price, qty: order.qty, tif: order.tif });
    lastBotError.delete(name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastBotError.get(name) !== message) console.warn(`${name} order rejected: ${message}`);
    lastBotError.set(name, message);
  }
}

async function scanCop(now: number): Promise<void> {
  const events = [...admin.db.eventLog.iter()]
    .filter(row => Number(row.ts.microsSinceUnixEpoch / 1000n) >= now - 30_000)
    .map(row => parseEventLog({ id: Number(row.id), kind: row.kind, marketId: row.marketId, payload: row.payload }))
    .filter(event => event !== null);
  const recorded = new Set([...admin.db.alert.iter()].flatMap(row => {
    try {
      const evidence = JSON.parse(row.evidence) as { incidentKey?: unknown };
      return typeof evidence.incidentKey === 'string' ? [evidence.incidentKey] : [];
    } catch { return []; }
  }));
  for (const candidate of detectSpoofing(events, now)) {
    const key = candidate.evidence.incidentKey;
    if (recorded.has(key) || pendingAlerts.has(key)) continue;
    const owner = [...admin.db.account.iter()].find(row => row.identity.toHexString() === candidate.owner);
    if (!owner) continue;
    pendingAlerts.add(key);
    try {
      await admin.reducers.adminRaiseAlert({ owner: owner.identity, kind: candidate.kind,
        score: candidate.score, evidence: JSON.stringify(candidate.evidence), narration: undefined });
    } catch (error) {
      pendingAlerts.delete(key);
      throw error;
    }
  }
}

function marketSnapshot() {
  const orders = [...admin.db.order.iter()].filter(row => row.marketId === 1 && row.status === 'open' && row.remaining > 0);
  const bids = orders.filter(row => row.side === 'buy').map(row => row.price);
  const asks = orders.filter(row => row.side === 'sell').map(row => row.price);
  const bestBid = bids.length ? Math.max(...bids) : undefined;
  const bestAsk = asks.length ? Math.min(...asks) : undefined;
  const trades = [...admin.db.trade.iter()].filter(row => row.marketId === 1);
  trades.sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch));
  const midPrice = bestBid !== undefined && bestAsk !== undefined ? Math.round((bestBid + bestAsk) / 2) : trades[0]?.price ?? 100;
  return { bestBid, bestAsk, midPrice };
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const now = clock();
    await scanCop(now);
    world = stepWorld(world, now, rng);
    if (now - lastNews >= 10_000) {
      pendingNews.push(worldNews(world, rng));
      lastNews = now;
    }
    for (const hint of pendingNews.filter(hint => hint.releaseAt <= now)) {
      await admin.reducers.adminPostNews({ marketId: 1, text: hint.text });
    }
    for (let i = pendingNews.length - 1; i >= 0; i--) if (pendingNews[i].releaseAt <= now) pendingNews.splice(i, 1);

    const snapshot = marketSnapshot();
    const mm = bots.get('market-maker')!;
    const mmOwner = mm.identity!.toHexString();
    const inventory = [...mm.db.position.iter()].find(row => row.owner.toHexString() === mmOwner && row.marketId === 1)?.qty ?? 0;
    try {
      await mm.reducers.cancelAll({});
      for (const quote of marketMakerQuotes({ marketId: 1, owner: mmOwner, midPrice: snapshot.midPrice, inventory })) {
        await placeBotOrder('market-maker', mm, quote);
      }
    } catch (error) {
      console.warn('market-maker refresh failed:', error instanceof Error ? error.message : String(error));
    }
    for (let i = 1; i <= botCount; i++) {
      const bot = bots.get(`noise-${i}`)!;
      const next = noiseOrder({ marketId: 1, owner: bot.identity!.toHexString(), ...snapshot, elapsedMs: 1000 }, rng);
      await placeBotOrder(`noise-${i}`, bot, next);
    }
    const informed = bots.get('informed')!;
    const next = informedOrder({ marketId: 1, owner: informed.identity!.toHexString(), fundamental: world.fundamental, ...snapshot });
    await placeBotOrder('informed', informed, next);
  } catch (error) {
    console.error('Runner tick failed:', error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

void tick();
const timer = setInterval(() => void tick(), 1000);
process.on('SIGINT', () => {
  clearInterval(timer);
  for (const connection of bots.values()) connection.disconnect();
  admin.disconnect();
});
