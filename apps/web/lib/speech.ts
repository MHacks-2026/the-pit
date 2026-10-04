import { narrationFacts, templateNarration, type NarrateAlert } from './narrator';

const MAX_AUDIO_BYTES = 1_000_000;
const REQUESTS_PER_MINUTE = 12;
const CACHE_SIZE = 20;

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
    if (!deps.enabled || !deps.apiKey || !deps.voiceId) return { status: 503 };
    const text = templateNarration(narrationFacts(alert));
    const cacheKey = `${deps.voiceId}:${deps.modelId ?? 'eleven_flash_v2_5'}:${text}`;
    const cached = cache.get(cacheKey);
    if (cached) return { status: 200, audio: cached };

    const now = deps.now();
    while (requestTimes.length && requestTimes[0] <= now - 60_000) requestTimes.shift();
    if (requestTimes.length >= REQUESTS_PER_MINUTE) return { status: 429 };
    requestTimes.push(now);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await deps.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(deps.voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'xi-api-key': deps.apiKey },
        body: JSON.stringify({ text, model_id: deps.modelId ?? 'eleven_flash_v2_5' }),
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
