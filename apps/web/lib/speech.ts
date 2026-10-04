import type { NarrateAlert } from './narrator';

const MAX_AUDIO_BYTES = 1_000_000;
const REQUESTS_PER_MINUTE = 12;
const CACHE_SIZE = 20;
/** ElevenLabs premade "Brian": a deep, warm American male voice. */
export const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb';
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
/** Steady, calm delivery: a little expressive range, no exaggerated style. */
export const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true };

/** The one sentence the Cop speaks for every alert. The name is already sanitised by parseNarrateAlert. */
export function spokenAlert(trader: string): string {
  return `Manipulation detected: check ${trader}.`;
}

export type SpeechResult =
  | { status: 200; audio: Uint8Array }
  | { status: 429 | 502 | 503 };

export function createSpeech(deps: {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  enabled: boolean;
  fetch: typeof fetch;
  now: () => number;
}) {
  const cache = new Map<string, Uint8Array>();
  const requestTimes: number[] = [];

  return async (alert: NarrateAlert): Promise<SpeechResult> => {
    if (!deps.enabled || !deps.apiKey) return { status: 503 };
    const voiceId = deps.voiceId || DEFAULT_VOICE_ID;
    const modelId = deps.modelId || DEFAULT_MODEL_ID;
    const text = spokenAlert(alert.trader);
    const cacheKey = `${voiceId}:${modelId}:${text}`;
    const cached = cache.get(cacheKey);
    if (cached) return { status: 200, audio: cached };

    const now = deps.now();
    while (requestTimes.length && requestTimes[0] <= now - 60_000) requestTimes.shift();
    if (requestTimes.length >= REQUESTS_PER_MINUTE) return { status: 429 };
    requestTimes.push(now);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await deps.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'xi-api-key': deps.apiKey },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS }),
      });
      if (!response.ok || Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES) return { status: 502 };
      const audio = new Uint8Array(await response.arrayBuffer());
      if (!audio.length || audio.length > MAX_AUDIO_BYTES) return { status: 502 };
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, audio);
      return { status: 200, audio };
    } catch {
      return { status: 502 };
    } finally {
      clearTimeout(timer);
    }
  };
}
