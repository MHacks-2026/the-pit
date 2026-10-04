import { describe, expect, it, vi } from 'vitest';
import { createSpeech } from './speech';

const alert = { kind: 'spoofing', score: 90, trader: 'Raj', evidence: {
  layerSide: 'sell', layerOrderIds: [1, 2, 3, 4], totalLayeredQty: 80, cancelledQty: 80,
} };

describe('createSpeech', () => {
  it('keeps the API key server-side, uses Daniel, and caches identical audio', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const speech = createSpeech({ apiKey: 'test-key', voiceId: 'daniel', enabled: true,
      fetch: fetcher as typeof fetch, now: () => 0 });
    expect(await speech(alert)).toEqual({ status: 200, audio: new Uint8Array([1, 2, 3]) });
    expect(await speech(alert)).toEqual({ status: 200, audio: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/text-to-speech/daniel');
    expect(init.headers).toMatchObject({ 'xi-api-key': 'test-key' });
    expect(JSON.parse(init.body as string).text).toContain('4 sell orders layered');
  });

  it('does not call ElevenLabs when disabled or unconfigured', async () => {
    const fetcher = vi.fn();
    const speech = createSpeech({ enabled: false, fetch: fetcher as typeof fetch, now: () => 0 });
    expect(await speech(alert)).toEqual({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('limits uncached synthesis requests and handles provider failure', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    const speech = createSpeech({ apiKey: 'test-key', voiceId: 'daniel', enabled: true,
      fetch: fetcher as typeof fetch, now: () => 0 });
    for (let i = 0; i < 12; i++) expect(await speech({ ...alert, trader: `Trader ${i}` })).toEqual({ status: 502 });
    expect(await speech({ ...alert, trader: 'One more' })).toEqual({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(12);
  });

  it('rejects oversized provider responses', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1]), {
      headers: { 'content-length': '1000001' },
    }));
    const speech = createSpeech({ apiKey: 'test-key', voiceId: 'daniel', enabled: true,
      fetch: fetcher as typeof fetch, now: () => 0 });
    expect(await speech(alert)).toEqual({ status: 502 });
  });
});
