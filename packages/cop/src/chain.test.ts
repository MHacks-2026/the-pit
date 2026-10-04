import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalEvent, canonicalMarker, chainHash, GENESIS_HASH, sha256Hex, verifyChain, type ChainEvent, type ChainLink,
} from './chain';

const nodeSha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches Node crypto on multi-block, padding-boundary and non-ASCII input', () => {
    for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Spoofing alert on Zoë 🚨', '{"kind":"trade"}']) {
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
  });
});

function build(events: ChainEvent[], anchor = GENESIS_HASH, startSeq = 1): ChainLink[] {
  const links: ChainLink[] = [];
  let prev = anchor;
  for (const [i, event] of events.entries()) {
    const hash = chainHash(prev, canonicalEvent(event));
    links.push({ seq: startSeq + i, eventId: event.id, marker: '', ts: event.ts, prevHash: prev, hash });
    prev = hash;
  }
  return links;
}

const events: ChainEvent[] = [1, 2, 3, 4].map(id => ({ id, kind: id === 3 ? 'trade' : 'order_placed', owner: 'aa', marketId: 1,
  payload: `{"n":${id}}`, ts: String(1_000_000 * id) }));

describe('verifyChain', () => {
  it('accepts an intact chain and reports its head', () => {
    const links = build(events);
    expect(verifyChain(links, events)).toEqual({ links: 4, unchainedBefore: 0, headHash: links[3].hash, issues: [] });
  });

  it('detects an edited event', () => {
    const edited = events.map(e => (e.id === 2 ? { ...e, payload: '{"n":999}' } : e));
    expect(verifyChain(build(events), edited).issues.map(i => [i.code, i.eventId])).toEqual([['EVENT_ALTERED', 2]]);
  });

  it('detects a deleted event, a deleted link and an event inserted without a link', () => {
    const links = build(events);
    expect(verifyChain(links, events.filter(e => e.id !== 3)).issues.map(i => i.code)).toEqual(['EVENT_MISSING']);
    expect(verifyChain(links.filter(l => l.seq !== 2), events).issues.map(i => i.code)).toEqual(['SEQ_GAP', 'BROKEN_LINK', 'EVENT_UNCHAINED']);
    const extra = { ...events[0], id: 5, payload: '{"forged":true}' };
    expect(verifyChain(links, [...events, extra]).issues.map(i => [i.code, i.eventId])).toEqual([['EVENT_UNCHAINED', 5]]);
  });

  it('detects a rewired link', () => {
    const links = build(events);
    links[2] = { ...links[2], prevHash: GENESIS_HASH };
    expect(verifyChain(links, events).issues.map(i => i.code)).toContain('BROKEN_LINK');
  });

  it('a reset marker continues the chain from the previous head, and old events before the chain are counted, not flagged', () => {
    const before = build(events.slice(0, 2));
    const markerTs = '9000000';
    const marker: ChainLink = { seq: 3, eventId: 0, marker: 'reset:1', ts: markerTs, prevHash: before[1].hash,
      hash: chainHash(before[1].hash, canonicalMarker('reset:1', markerTs)) };
    const after = build(events.slice(2), marker.hash, 4);
    // After a reset the module deletes old events and old links; the marker's prevHash anchors to the published head.
    const report = verifyChain([marker, ...after], events.slice(2));
    expect(report.issues).toEqual([]);
    expect(report.headHash).toBe(after[1].hash);
    const legacy = { ...events[0], id: 0 };
    expect(verifyChain(build(events.slice(1)), [legacy, ...events.slice(1)]).unchainedBefore).toBe(1);
    expect(verifyChain([{ ...marker, marker: 'reset:2' }, ...after], events.slice(2)).issues.map(i => i.code)).toEqual(['MARKER_ALTERED']);
  });
});
