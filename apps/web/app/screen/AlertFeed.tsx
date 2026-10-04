'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@the-pit/bindings';
import { groupAlertCases } from '../../lib/alertCases';

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

function RecordSeal() {
  const [heads] = useTable(tables.chainHead);
  const head = heads[0];
  if (!head) return null;
  return <p className="cop-seal" title={`Latest SHA-256 link: ${head.hash}`}>
    Record sealed · {Number(head.seq).toLocaleString('en-US')} linked events · {head.hash.slice(0, 8)}…
  </p>;
}

// Cop voice: each new alert is spoken once ("Manipulation detected: check <name>."), one clip at a time.
// Browsers block audio until the viewer interacts with the page, so the screen shows an enable button until then.
const VOICE_REPEAT_MS = 15_000;

type SpeakRequest = { kind: string; score: number; trader: string; evidence: unknown };
type SpeakerState = { speaking: boolean; error: boolean; blocked: boolean };

function createCopSpeaker(onChange: (state: SpeakerState) => void) {
  const audio = new Audio();
  let url: string | null = null;
  let busy = false;
  let next: SpeakRequest | null = null;
  let finish: (() => void) | null = null;

  async function run(request: SpeakRequest) {
    busy = true;
    onChange({ speaking: true, error: false, blocked: false });
    let error = false;
    let blocked = false;
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alert: request }),
      });
      if (!response.ok) throw new Error('Speech unavailable');
      const blob = await response.blob();
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      audio.src = url;
      const done = new Promise<void>(resolve => {
        finish = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      await audio.play();
      await done;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') blocked = true;
      else error = true;
    }
    finish = null;
    busy = false;
    onChange({ speaking: false, error, blocked });
    if (next) {
      const queued = next;
      next = null;
      void run(queued);
    }
  }

  return {
    /** Speaks now, or after the current clip; a newer request replaces any waiting one. */
    say(request: SpeakRequest) {
      if (busy) next = request;
      else void run(request);
    },
    stop() {
      next = null;
      audio.pause();
      finish?.();
    },
    dispose() {
      this.stop();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

function useCopVoice() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState({ speaking: false, error: false });
  const speaker = useRef<ReturnType<typeof createCopSpeaker> | null>(null);

  useEffect(() => {
    const current = createCopSpeaker(state => {
      setStatus({ speaking: state.speaking, error: state.error });
      if (state.blocked) setUnlocked(false);
    });
    speaker.current = current;
    fetch('/api/speech').then(response => response.json())
      .then((config: { available?: boolean }) => setAvailable(Boolean(config.available)))
      .catch(() => {});
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation?.hasBeenActive) setUnlocked(true);
    const unlock = () => setUnlocked(true);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      current.dispose();
      speaker.current = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return {
    available, enabled, unlocked, ...status,
    unlock: () => setUnlocked(true),
    toggle: () => {
      if (enabled) speaker.current?.stop();
      setEnabled(!enabled);
    },
    say: (request: SpeakRequest) => speaker.current?.say(request),
  };
}

function speakRequest(alert: AlertRow, trader: string): SpeakRequest {
  return { kind: alert.kind, score: alert.score, trader, evidence: readEvidence(alert.evidence) };
}

function FeedContent() {
  const { connectionError } = useSpacetimeDB();
  const [alerts, alertsReady] = useTable(tables.alert);
  const [accounts] = useTable(tables.account);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const voice = useCopVoice();
  const names = new Map(accounts.map(account => [account.identity.toHexString(), account.name]));
  const nameFor = (owner: string) => names.get(owner) || `Trader ${owner.slice(0, 8)}`;

  // Speak alerts that arrive after the page loaded; the ones already there are history.
  const seenAlerts = useRef<Set<string> | null>(null);
  const lastSpoken = useRef(new Map<string, number>());
  useEffect(() => {
    if (!alertsReady) return;
    if (!seenAlerts.current) {
      seenAlerts.current = new Set(alerts.map(alert => alert.id.toString()));
      return;
    }
    const seen = seenAlerts.current;
    const fresh = alerts.filter(alert => !seen.has(alert.id.toString()));
    if (fresh.length === 0) return;
    for (const alert of fresh) seen.add(alert.id.toString());
    if (!voice.available || !voice.enabled || !voice.unlocked) return;
    const newestFresh = fresh.reduce((a, b) => (b.ts.microsSinceUnixEpoch > a.ts.microsSinceUnixEpoch ? b : a));
    const owner = newestFresh.owner.toHexString();
    const now = Date.now();
    if (now - (lastSpoken.current.get(owner) ?? -Infinity) < VOICE_REPEAT_MS) return;
    lastSpoken.current.set(owner, now);
    voice.say(speakRequest(newestFresh as AlertRow, nameFor(owner)));
  }, [alerts, alertsReady, voice.available, voice.enabled, voice.unlocked]);
  const latest = [...alerts].sort((a, b) => Number(b.ts.microsSinceUnixEpoch - a.ts.microsSinceUnixEpoch)).slice(0, 100);
  const cases = groupAlertCases(latest.map(alert => ({ id: alert.id.toString(),
    owner: alert.owner.toHexString(), kind: alert.kind,
    at: Number(alert.ts.microsSinceUnixEpoch / 1000n), alert: alert as AlertRow })));
  const selected = cases.find(item => item.entries.some(entry => entry.id === selectedId)) ?? cases[0];

  if (connectionError) return <p className="feed-state" role="alert">Live alert feed unavailable.</p>;
  if (!alertsReady) return <p className="feed-state" role="status">Connecting to live alerts…</p>;
  if (!selected) return <><p className="feed-state" role="status">No alerts yet. The Market Cop is watching.</p><RecordSeal /></>;

  const newest = selected.entries[0].alert;
  const ownerName = nameFor(selected.owner);
  const caseLabel = `Suspected ${selected.kind.replaceAll('_', ' ')}`;
  return <>
    <div className="cop-dashboard">
      <article className="cop-focus" aria-live="polite">
        <div className="cop-focus-top"><span className="cop-pattern">{caseLabel}</span>
          <time dateTime={new Date(selected.latestAt).toISOString()}>{new Date(selected.latestAt).toLocaleTimeString()}</time></div>
        <h3>{ownerName}</h3>
        <p className="cop-sequence">{sequence(newest.evidence)}</p>
        <p className="cop-count">{selected.entries.length} finding{selected.entries.length === 1 ? '' : 's'} shown · Pattern match, not proof of intent</p>
        {voice.available && <div className="cop-voice">
          {voice.unlocked
            ? <button type="button" aria-pressed={voice.enabled} onClick={voice.toggle}>{voice.enabled ? 'Voice on' : 'Voice off'}</button>
            : <button type="button" className="cop-voice-enable" onClick={voice.unlock}>Click to enable voice</button>}
          <button type="button" onClick={() => voice.say(speakRequest(newest, ownerName))} disabled={voice.speaking}>
            {voice.speaking ? 'Speaking…' : 'Hear alert'}
          </button>
          {voice.error && <span role="status">Voice unavailable</span>}
        </div>}
        <details className="cop-evidence">
          <summary>View evidence</summary>
          <div className="cop-evidence-scroll" role="region" aria-label="Finding evidence" tabIndex={0}>
            <ol>
              {selected.entries.map(({ alert }) => <li key={alert.id.toString()}>
                <div className="cop-finding-head"><strong>Finding #{alert.id.toString()}</strong>
                  <time dateTime={new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toISOString()}>
                    {new Date(Number(alert.ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}</time></div>
                <p>{sequence(alert.evidence)}</p>
                <EvidenceFacts raw={alert.evidence} />
              </li>)}
            </ol>
          </div>
        </details>
      </article>
      <aside className="cop-recent" aria-label="Recent alert cases">
        <div className="cop-recent-head"><h3>Recent</h3>
          {selected !== cases[0] && <button type="button" onClick={() => setSelectedId(null)}>Latest</button>}</div>
        <div className="cop-recent-scroll" role="region" aria-label="Recent alert accounts" tabIndex={0}>
          <ol>
            {cases.slice(0, 10).map(item => {
              const name = nameFor(item.owner);
              return <li key={item.entries[0].id}><button type="button"
                aria-pressed={selected === item} onClick={() => setSelectedId(item.entries[0].id)}>
                <span><strong>{name}</strong><small>{item.kind.replaceAll('_', ' ')} · {item.entries.length} finding{item.entries.length === 1 ? '' : 's'}</small></span>
                <time dateTime={new Date(item.latestAt).toISOString()}>{new Date(item.latestAt).toLocaleTimeString()}</time>
              </button></li>;
            })}
          </ol>
        </div>
      </aside>
    </div>
    <RecordSeal />
  </>;
}

export default function AlertFeed() {
  const uri = process.env.NEXT_PUBLIC_SPACETIME_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIME_DB;
  const validUri = uri && (process.env.NODE_ENV !== 'production' || uri.startsWith('wss://'));
  const connectionBuilder = useMemo(() => validUri && database ? DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database) : null, [uri, database, validUri]);
  if (!connectionBuilder) {
    return <p className="feed-state" role="alert">The live alert feed is not configured.</p>;
  }
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}><FeedContent /></SpacetimeDBProvider>;
}
