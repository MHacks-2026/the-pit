'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@the-pit/bindings';
import { groupAlertCases } from '../../lib/alertCases';
import { liveConnectionBuilder } from '../../lib/live';
import TraderBadge from '../TraderBadge';

type AlertRow = { id: bigint; kind: string; score: number; evidence: string; ts: { microsSinceUnixEpoch: bigint };
  owner: { toHexString(): string } };

type SpoofEvidence = {
  layerSide?: 'buy' | 'sell';
  layerOrderIds?: number[];
  layerPrices?: number[];
  oppositeTradeId?: number;
  cancelledOrderIds?: number[];
  cancelledQty?: number;
  totalLayeredQty?: number;
};

function readEvidence(raw: string): SpoofEvidence | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SpoofEvidence : null;
  } catch { return null; }
}

function sequence(raw: string): string {
  const evidence = readEvidence(raw);
  if (!evidence || !Array.isArray(evidence.layerOrderIds) ||
    typeof evidence.cancelledQty !== 'number' || typeof evidence.totalLayeredQty !== 'number') {
    return 'Evidence recorded';
  }
  const side = evidence.layerSide === 'buy' || evidence.layerSide === 'sell' ? evidence.layerSide : '';
  const opposite = side === 'buy' ? 'sell' : side === 'sell' ? 'buy' : '';
  return `${evidence.layerOrderIds.length} ${side ? side + ' ' : ''}orders → ${opposite ? opposite + ' ' : ''}trade → ${evidence.cancelledQty}/${evidence.totalLayeredQty} units cancelled`;
}

function EvidenceFacts({ raw }: { raw: string }) {
  const evidence = readEvidence(raw);
  if (!evidence) return <p>Structured evidence unavailable for this finding.</p>;
  const orderIds = Array.isArray(evidence.layerOrderIds) ? evidence.layerOrderIds : [];
  const cancelledIds = Array.isArray(evidence.cancelledOrderIds) ? evidence.cancelledOrderIds : [];
  return <dl className="cop-facts">
    {orderIds.length > 0 && <><dt>Layer orders</dt><dd>{orderIds.map(id => `#${id}`).join(', ')}</dd></>}
    {Array.isArray(evidence.layerPrices) && evidence.layerPrices.length > 0 &&
      <><dt>Prices</dt><dd>{[...new Set(evidence.layerPrices)].join(', ')} ticks</dd></>}
    {typeof evidence.oppositeTradeId === 'number' && <><dt>Opposite trade</dt><dd>#{evidence.oppositeTradeId}</dd></>}
    {cancelledIds.length > 0 && <><dt>Cancelled orders</dt><dd>{cancelledIds.map(id => `#${id}`).join(', ')}</dd></>}
    {typeof evidence.cancelledQty === 'number' && typeof evidence.totalLayeredQty === 'number' &&
      <><dt>Cancelled quantity</dt><dd>{evidence.cancelledQty} of {evidence.totalLayeredQty}</dd></>}
  </dl>;
}

/** The newest link of the tamper-evident market record (one row), so the room can see the record being sealed. */
function RecordSeal() {
  const [heads] = useTable(tables.chainHead);
  const head = heads[0];
  if (!head) return null;
  return <p className="seal" title={`Latest SHA-256 link: ${head.hash}`}>
    <b>Record sealed</b> {Number(head.seq).toLocaleString('en-US')} events, latest link <code>{head.hash.slice(0, 8)}…{head.hash.slice(-4)}</code>.
    Editing or deleting any past event breaks every later link.
  </p>;
}

// An empty WAV, played inside the click that turns the voice on, so the browser lets later alerts play sound.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function browserSay(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/**
 * The Cop's voice on the Big Screen: ElevenLabs audio from /api/speak, else the browser's built-in voice, else text.
 * Off on every page load because browsers block sound until someone clicks; the toggle is that click.
 */
function useCopVoice() {
  const [on, setOn] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const onRef = useRef(false);
  onRef.current = on;

  function toggle() {
    if (on) {
      setOn(false);
      audio.current?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      return;
    }
    audio.current ??= new Audio();
    audio.current.src = SILENT_WAV;
    void audio.current.play().catch(() => {});
    setOn(true);
    setEngine(null);
    browserSay('Cop voice on.');
  }

  async function say(alert: { kind: string; score: number; trader: string; evidence: unknown }) {
    if (!onRef.current) return;
    try {
      const response = await fetch('/api/speak', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alert }),
      });
      if ((response.headers.get('content-type') ?? '').startsWith('audio/') && audio.current) {
        const text = decodeURIComponent(response.headers.get('x-narration') ?? '');
        const url = URL.createObjectURL(await response.blob());
        audio.current.src = url;
        audio.current.onended = () => URL.revokeObjectURL(url);
        await audio.current.play().then(() => setEngine('ElevenLabs'), () => { browserSay(text); setEngine('Browser voice'); });
        return;
      }
      const result = await response.json() as { text?: string };
      if (result.text) { browserSay(result.text); setEngine('Browser voice'); }
    } catch { /* the case on screen still says it */ }
  }

  return { on, engine, toggle, say };
}

function FeedContent() {
  const { connectionError } = useSpacetimeDB();
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const bots = new Map(accounts.map(account => [account.identity.toHexString(), account.isBot]));
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 24);
  const cases = groupAlertCases(latest.map(alert => ({ id: alert.id.toString(),
    owner: alert.owner.toHexString(), kind: alert.kind,
    at: Number(alert.ts.microsSinceUnixEpoch / 1000n), alert: alert as AlertRow })));
  const selected = cases.find(item => item.entries.some(entry => entry.id === selectedId)) ?? cases[0];
  const voice = useCopVoice();

  // The one orchestrated moment: when a new alert lands, police tape sweeps across the screen, the case is stamped
  // "Cited" and the Cop reads it out. Alerts already there when the page loaded count as seen, so a reload never replays.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState(new Set<string>());
  const [sweep, setSweep] = useState(0);
  useEffect(() => {
    if (!alertsReady) return;
    const ids = alerts.map(alert => alert.id.toString());
    if (!seen.current) { seen.current = new Set(ids); return; }
    const arrived = ids.filter(id => !seen.current!.has(id));
    if (!arrived.length) return;
    for (const id of arrived) seen.current.add(id);
    setFresh(previous => new Set([...previous, ...arrived]));
    setSweep(n => n + 1);
    setSelectedId(null); // jump to the newest case
    // Speak only the newest arrival, so a burst of alerts does not queue up a monologue.
    const newest = alerts.filter(alert => arrived.includes(alert.id.toString()))
      .sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch))[0];
    void voice.say({ kind: newest.kind, score: newest.score, trader: names.get(newest.owner.toHexString()) ?? '',
      evidence: readEvidence(newest.evidence) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, alertsReady]);

  if (connectionError) return <p className="state" role="alert">The live alert feed is unavailable. Check the SpacetimeDB endpoint and database configuration.</p>;
  if (!alertsReady) return <p className="state" role="status">Connecting to the live alert feed…</p>;

  const controls = <>
    {sweep ? <div key={sweep} className="cop-sweep" aria-hidden="true" /> : null}
    <p className="voice">
      <button type="button" className="voice-toggle" aria-pressed={voice.on} onClick={voice.toggle}>
        {voice.on ? 'Mute Cop voice' : 'Turn on Cop voice'}
      </button>
      <span className="quiet">{voice.on ? (voice.engine ? `Speaking new alerts with: ${voice.engine}` : 'New alerts will be read out.') : 'Reads each new alert aloud.'}</span>
    </p>
  </>;

  if (!selected) return <>{controls}<p className="state" role="status">No alerts yet. The Cop is watching every order.</p><RecordSeal /></>;

  const newest = selected.entries[0].alert;
  const ownerName = names.get(selected.owner) || `Trader ${selected.owner.slice(0, 8)}`;
  const caseLabel = `Suspected ${selected.kind.replaceAll('_', ' ')}`;
  const isNew = fresh.has(selected.entries[0].id);
  return <>
    {controls}
    <div className="cop-dashboard">
      <article key={selected.entries[0].id} className={isNew ? 'cop-focus cop-focus-new' : 'cop-focus'} aria-live="polite">
        <div className="cop-stripes" aria-hidden="true" />
        <div className="cop-focus-body">
          <div className="cop-focus-top"><span className="cop-pattern">{caseLabel}</span>
            <time dateTime={new Date(selected.latestAt).toISOString()}>{new Date(selected.latestAt).toLocaleTimeString()}</time></div>
          <h3 className="cop-who"><TraderBadge name={ownerName} isBot={bots.get(selected.owner) ?? false} /> {ownerName}</h3>
          <p className="cop-sequence">{sequence(newest.evidence)}</p>
          <p className="cop-count">{selected.entries.length} finding{selected.entries.length === 1 ? '' : 's'} shown. Pattern match, not proof of intent.</p>
          <details className="cop-evidence">
            <summary>View evidence</summary>
            <ol>
              {selected.entries.map(({ alert }) => <li key={alert.id.toString()}>
                <div className="cop-finding-head"><strong>Finding #{alert.id.toString()}</strong>
                  <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
                    {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}</time></div>
                <p>{sequence(alert.evidence)}</p>
                <EvidenceFacts raw={alert.evidence} />
              </li>)}
            </ol>
          </details>
        </div>
        {isNew ? <span className="stamp" aria-hidden="true">Cited</span> : null}
      </article>
      <aside className="cop-recent" aria-label="Recent alert cases">
        <div className="cop-recent-head"><h3>Recent</h3>
          {selected !== cases[0] && <button type="button" onClick={() => setSelectedId(null)}>Latest</button>}</div>
        <ol>
          {cases.slice(0, 5).map(item => {
            const name = names.get(item.owner) || `Trader ${item.owner.slice(0, 8)}`;
            return <li key={item.entries[0].id}><button type="button"
              aria-pressed={selected === item} onClick={() => setSelectedId(item.entries[0].id)}>
              <span><strong>{name}</strong><small>{item.kind.replaceAll('_', ' ')}, {item.entries.length} finding{item.entries.length === 1 ? '' : 's'}</small></span>
              <time dateTime={new Date(item.latestAt).toISOString()}>{new Date(item.latestAt).toLocaleTimeString()}</time>
            </button></li>;
          })}
        </ol>
      </aside>
    </div>
    <RecordSeal />
  </>;
}

export default function AlertFeed() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? liveConnectionBuilder(uri, database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="state" role="alert">The live alert feed is not configured.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
