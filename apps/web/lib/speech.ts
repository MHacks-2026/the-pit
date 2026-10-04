// Market Cop voice (spec section 6): turns a narration sentence into speech with ElevenLabs, server-side only.
// Never throws: on a missing key, the kill switch, a rate limit, an error or a timeout it returns null, and the
// Big Screen falls back to the browser's built-in voice (then text only).

export const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
/** ElevenLabs' premade "Daniel" voice (calm, authoritative). Override with ELEVENLABS_VOICE_ID. */
export const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
/** Low-latency model, so the voice lands within a second or two of the alert. Override with ELEVENLABS_MODEL_ID. */
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
export const SPEECH_MIN_INTERVAL_MS = 3_000;
export const SPEECH_TIMEOUT_MS = 8_000;
export const MAX_SPEECH_CHARS = 300;
const CACHE_SIZE = 40;

export interface SpeechDeps {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  enabled: boolean;
  fetch: typeof fetch;
  now: () => number;
}

export type Speech = { audio: Uint8Array; source: 'elevenlabs' | 'cache' } | { audio: null; reason: string };

export function createSpeaker(deps: SpeechDeps) {
  const cache = new Map<string, Uint8Array>();
  let lastCall = -Infinity;
  const voiceId = deps.voiceId || DEFAULT_VOICE_ID;
  const modelId = deps.modelId || DEFAULT_MODEL_ID;

  return async function speak(text: string): Promise<Speech> {
    const line = text.trim();
    if (!line || line.length > MAX_SPEECH_CHARS) return { audio: null, reason: 'text length' };
    const cached = cache.get(line);
    if (cached) return { audio: cached, source: 'cache' };
    if (!deps.enabled) return { audio: null, reason: 'disabled' };
    if (!deps.apiKey) return { audio: null, reason: 'no key' };
    if (deps.now() - lastCall < SPEECH_MIN_INTERVAL_MS) return { audio: null, reason: 'rate limited' };
    lastCall = deps.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPEECH_TIMEOUT_MS);
    try {
      const response = await deps.fetch(`${ELEVENLABS_URL}/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'xi-api-key': deps.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text: line, model_id: modelId }),
      });
      if (!response.ok) return { audio: null, reason: `elevenlabs ${response.status}` };
      if (!(response.headers.get('content-type') ?? '').startsWith('audio/')) return { audio: null, reason: 'not audio' };
      const audio = new Uint8Array(await response.arrayBuffer());
      if (!audio.length) return { audio: null, reason: 'empty audio' };
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(line, audio);
      return { audio, source: 'elevenlabs' };
    } catch {
      return { audio: null, reason: 'request failed' };
    } finally {
      clearTimeout(timer);
    }
  };
}
