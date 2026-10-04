import { describe, expect, it } from 'vitest';
import { createSpeaker, DEFAULT_MODEL_ID, DEFAULT_VOICE_ID, MAX_SPEECH_CHARS, SPEECH_MIN_INTERVAL_MS } from './speech';

function fakeFetch(reply: { status?: number; type?: string; bytes?: number } | 'throw') {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    if (reply === 'throw') throw new Error('network down');
    return new Response(new Uint8Array(reply.bytes ?? 4), {
      status: reply.status ?? 200, headers: { 'content-type': reply.type ?? 'audio/mpeg' } });
  }) as typeof fetch;
  return { impl, calls };
}

const line = 'Spoofing alert on Raj, score 100: 3 sell orders layered, then a buy trade, then 60 of 60 units cancelled.';

describe('createSpeaker', () => {
  it('asks ElevenLabs for the sentence with the key, voice and model, then serves repeats from cache', async () => {
    const { impl, calls } = fakeFetch({ bytes: 10 });
    const speak = createSpeaker({ apiKey: 'k', enabled: true, fetch: impl, now: () => 0 });
    const first = await speak(line);
    expect(first).toMatchObject({ source: 'elevenlabs' });
    expect(first.audio?.length).toBe(10);
    expect(await speak(line)).toMatchObject({ source: 'cache' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe('k');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ text: line, model_id: DEFAULT_MODEL_ID });
  });

  it('uses a configured voice and model', async () => {
    const { impl, calls } = fakeFetch({});
    await createSpeaker({ apiKey: 'k', voiceId: 'v1', modelId: 'm1', enabled: true, fetch: impl, now: () => 0 })(line);
    expect(calls[0].url.endsWith('/v1')).toBe(true);
    expect(JSON.parse(calls[0].init.body as string).model_id).toBe('m1');
  });

  it('returns no audio (so the browser voice takes over) when off, keyless, failing or not audio', async () => {
    const cases = [
      { deps: { apiKey: 'k', enabled: false }, reply: {}, reason: 'disabled' },
      { deps: { apiKey: undefined, enabled: true }, reply: {}, reason: 'no key' },
      { deps: { apiKey: 'k', enabled: true }, reply: { status: 401 }, reason: 'elevenlabs 401' },
      { deps: { apiKey: 'k', enabled: true }, reply: { type: 'application/json' }, reason: 'not audio' },
      { deps: { apiKey: 'k', enabled: true }, reply: { bytes: 0 }, reason: 'empty audio' },
      { deps: { apiKey: 'k', enabled: true }, reply: 'throw' as const, reason: 'request failed' },
    ];
    for (const c of cases) {
      const speak = createSpeaker({ ...c.deps, fetch: fakeFetch(c.reply).impl, now: () => 0 });
      expect(await speak(line)).toEqual({ audio: null, reason: c.reason });
    }
  });

  it('refuses empty or overlong text and allows one ElevenLabs call per interval', async () => {
    const { impl, calls } = fakeFetch({});
    let now = 0;
    const speak = createSpeaker({ apiKey: 'k', enabled: true, fetch: impl, now: () => now });
    expect(await speak('   ')).toEqual({ audio: null, reason: 'text length' });
    expect(await speak('x'.repeat(MAX_SPEECH_CHARS + 1))).toEqual({ audio: null, reason: 'text length' });
    await speak('first alert');
    expect(await speak('second alert')).toEqual({ audio: null, reason: 'rate limited' });
    now = SPEECH_MIN_INTERVAL_MS;
    expect(await speak('second alert')).toMatchObject({ source: 'elevenlabs' });
    expect(calls).toHaveLength(2);
  });
});
