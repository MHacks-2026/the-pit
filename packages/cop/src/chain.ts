// Tamper-evident market record: every event_log row is chained to the one before it with SHA-256, so editing, deleting
// or inserting a past row breaks every later link. Pure and synchronous (SpacetimeDB reducers cannot await WebCrypto),
// so SHA-256 is implemented here; tested against the NIST test vectors.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

/** SHA-256 of a string's UTF-8 bytes, as 64 lowercase hex characters. */
export function sha256Hex(text: string): string {
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 2 ** 32);
  for (const word of [high, bitLength >>> 0]) bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  return [...h].map(word => word.toString(16).padStart(8, '0')).join('');
}

export const GENESIS_HASH = '0'.repeat(64);

/** The fields of an event_log row that the chain commits to. ts is microseconds since the epoch, as a decimal string. */
export interface ChainEvent { id: number; kind: string; owner: string; marketId: number; payload: string; ts: string }

/** One fixed serialisation, used by both the writer (the module) and the verifier, so they cannot drift apart. */
export function canonicalEvent(event: ChainEvent): string {
  return JSON.stringify(['event', event.id, event.kind, event.owner, event.marketId, event.payload, event.ts]);
}

/** Non-event links, e.g. a market reset, so the reset itself is on the record. */
export function canonicalMarker(marker: string, ts: string): string {
  return JSON.stringify(['marker', marker, ts]);
}

export function chainHash(previousHash: string, canonical: string): string {
  return sha256Hex(`${previousHash}\n${canonical}`);
}

/** A row of the chain table. eventId 0 with a non-empty marker means a marker link. */
export interface ChainLink { seq: number; eventId: number; marker: string; ts: string; prevHash: string; hash: string }

export interface ChainIssue { code: 'SEQ_GAP' | 'BROKEN_LINK' | 'EVENT_MISSING' | 'EVENT_ALTERED' | 'MARKER_ALTERED' | 'EVENT_UNCHAINED'; seq?: number; eventId?: number; detail: string }

export interface ChainReport {
  links: number;
  /** Events written before the chain existed (not covered). */
  unchainedBefore: number;
  headHash: string | null;
  issues: ChainIssue[];
}

/**
 * Recomputes every link. Detects edited rows (EVENT_ALTERED), deleted rows (EVENT_MISSING, SEQ_GAP), rows inserted
 * without a link (EVENT_UNCHAINED) and rewired links (BROKEN_LINK). The first link's prevHash is the anchor: it is
 * GENESIS_HASH for a new chain, or the head before the most recent market reset.
 */
export function verifyChain(links: readonly ChainLink[], events: readonly ChainEvent[]): ChainReport {
  const issues: ChainIssue[] = [];
  const sorted = [...links].sort((a, b) => a.seq - b.seq);
  const eventsById = new Map(events.map(event => [event.id, event]));
  const chainedIds = new Set<number>();
  let previous: ChainLink | null = null;
  for (const link of sorted) {
    if (previous && link.seq !== previous.seq + 1) {
      issues.push({ code: 'SEQ_GAP', seq: link.seq, detail: `links ${previous.seq + 1}..${link.seq - 1} are missing` });
    }
    if (previous && link.prevHash !== previous.hash) {
      issues.push({ code: 'BROKEN_LINK', seq: link.seq, detail: `link ${link.seq} does not point at link ${previous.seq}` });
    }
    if (link.marker) {
      if (chainHash(link.prevHash, canonicalMarker(link.marker, link.ts)) !== link.hash) {
        issues.push({ code: 'MARKER_ALTERED', seq: link.seq, detail: `marker "${link.marker}" does not match its hash` });
      }
    } else {
      chainedIds.add(link.eventId);
      const event = eventsById.get(link.eventId);
      if (!event) issues.push({ code: 'EVENT_MISSING', seq: link.seq, eventId: link.eventId, detail: `event ${link.eventId} was deleted` });
      else if (chainHash(link.prevHash, canonicalEvent(event)) !== link.hash) {
        issues.push({ code: 'EVENT_ALTERED', seq: link.seq, eventId: link.eventId, detail: `event ${link.eventId} was changed after it was written` });
      }
    }
    previous = link;
  }
  const firstChained = sorted.find(link => !link.marker)?.eventId;
  let unchainedBefore = 0;
  for (const event of events) {
    if (chainedIds.has(event.id)) continue;
    if (firstChained === undefined || event.id < firstChained) unchainedBefore++;
    else issues.push({ code: 'EVENT_UNCHAINED', eventId: event.id, detail: `event ${event.id} has no link (inserted outside the chain)` });
  }
  return { links: sorted.length, unchainedBefore, headHash: previous?.hash ?? null, issues };
}
