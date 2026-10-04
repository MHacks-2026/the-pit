import { describe, expect, it } from 'vitest';
import {
  createNarrator, isGrounded, LLM_MIN_INTERVAL_MS, MAX_WORDS, narrationFacts, parseNarrateAlert, templateNarration,
  type NarrateAlert,
} from './narrator';

// Shape of the Cop's SpoofEvidence, as stored in the alert row.
const evidence = {
  incidentKey: 'abc:1:11,12,13,14', marketId: 1, layerSide: 'sell', layerOrderIds: [11, 12, 13, 14],
  layerPrices: [102, 103, 104, 105], placedAt: [1_000, 1_000, 1_000, 1_000], oppositeTradeId: 20, oppositeTradeAt: 2_000,
  cancelledOrderIds: [11, 12, 13, 14], cancelledQty: 80, totalLayeredQty: 80, medianOrderQty: 20,
};
const alert: NarrateAlert = { kind: 'spoofing', score: 100, trader: 'Raj', evidence };

function fakeFetch(reply: { status?: number; stop_reason?: string; text?: string } | 'throw') {
  const calls: RequestInit[] = [];
  const impl = (async (_url: unknown, init?: RequestInit) => {
    calls.push(init!);
    if (reply === 'throw') throw new Error('network down');
    return new Response(JSON.stringify({ stop_reason: reply.stop_reason ?? 'end_turn', content: [{ type: 'text', text: reply.text ?? '' }] }),
      { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('parseNarrateAlert', () => {
  it('accepts a well-formed alert and cleans the display name', () => {
    expect(parseNarrateAlert({ alert: { ...alert, trader: '  <b>Raj</b>!  ' } })).toMatchObject({ kind: 'spoofing', score: 100, trader: 'bRajb' });
    expect(parseNarrateAlert({ alert: { ...alert, trader: undefined } })?.trader).toBe('A trader');
  });
  it('rejects malformed input', () => {
    for (const body of [null, {}, { alert: { ...alert, score: 101 } }, { alert: { ...alert, score: 9.5 } }, { alert: { ...alert, kind: 'DROP TABLE' } }]) {
      expect(parseNarrateAlert(body)).toBeNull();
    }
  });
});

describe('narrationFacts', () => {
  it('derives a small fact set from SpoofEvidence', () => {
    expect(narrationFacts(alert)).toEqual({ kind: 'spoofing', score: 100, trader: 'Raj', layerSide: 'sell', tradeSide: 'buy',
      layers: 4, priceLevels: 4, layeredQty: 80, cancelledQty: 80, cancelledPct: 100, secondsLayerToTrade: 1 });
  });
  it('drops malformed evidence fields instead of guessing', () => {
    expect(narrationFacts({ ...alert, evidence: { layerSide: 'up', layerOrderIds: ['x'], cancelledQty: 1.5 } }))
      .toEqual({ kind: 'spoofing', score: 100, trader: 'Raj' });
    expect(narrationFacts({ ...alert, evidence: 'not json' })).toEqual({ kind: 'spoofing', score: 100, trader: 'Raj' });
  });
});

describe('templateNarration', () => {
  it('states the evidence in at most 25 words and is itself grounded', () => {
    const facts = narrationFacts(alert);
    const text = templateNarration(facts);
    expect(text).toBe('Spoofing alert on Raj, score 100: 4 sell orders layered, then a buy trade, then 80 of 80 units cancelled.');
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
    expect(isGrounded(text, facts)).toBe(true);
  });
  it('falls back to a short sentence when evidence is missing', () => {
    expect(templateNarration(narrationFacts({ ...alert, kind: 'quote_stuffing', evidence: {} }))).toBe('Quote stuffing alert on Raj, score 100.');
  });
});

describe('isGrounded', () => {
  const facts = narrationFacts(alert);
  it('accepts text whose numbers all come from the facts', () => {
    expect(isGrounded('Raj stacked 4 sell orders, bought, then pulled all 80 units within 1 second. Score 100!', facts)).toBe(true);
  });
  it('rejects invented numbers, empty text and text over 25 words', () => {
    expect(isGrounded('Raj made $5000 by stacking 4 sell orders.', facts)).toBe(false);
    expect(isGrounded('   ', facts)).toBe(false);
    expect(isGrounded(Array(26).fill('word').join(' '), facts)).toBe(false);
  });
});

describe('createNarrator', () => {
  const llmText = 'Raj stacked 4 sell orders, grabbed a buy, then yanked all 80 units. Score 100!';

  it('uses the LLM when enabled and grounded, then serves the cache', async () => {
    const { impl, calls } = fakeFetch({ text: llmText });
    const narrate = createNarrator({ apiKey: 'k', enabled: true, fetch: impl, now: () => 0 });
    expect(await narrate(alert)).toEqual({ text: llmText, source: 'llm' });
    expect(await narrate(alert)).toEqual({ text: llmText, source: 'cache' });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low' } });
    expect(JSON.parse(body.messages[0].content)).toEqual(narrationFacts(alert));
    expect((calls[0].headers as Record<string, string>)['x-api-key']).toBe('k');
  });

  it('falls back to the template on kill switch, missing key, errors, refusals and ungrounded text', async () => {
    const template = templateNarration(narrationFacts(alert));
    const cases = [
      { enabled: false, apiKey: 'k', reply: { text: llmText } },
      { enabled: true, apiKey: undefined, reply: { text: llmText } },
      { enabled: true, apiKey: 'k', reply: 'throw' as const },
      { enabled: true, apiKey: 'k', reply: { status: 500 } },
      { enabled: true, apiKey: 'k', reply: { stop_reason: 'refusal', text: llmText } },
      { enabled: true, apiKey: 'k', reply: { text: 'Raj made 9999 dollars.' } },
    ];
    for (const { enabled, apiKey, reply } of cases) {
      const narrate = createNarrator({ apiKey, enabled, fetch: fakeFetch(reply).impl, now: () => 0 });
      expect(await narrate(alert)).toEqual({ text: template, source: 'template' });
    }
  });

  it('allows at most one LLM call per 6 s', async () => {
    const { impl, calls } = fakeFetch({ text: llmText });
    let now = 0;
    const narrate = createNarrator({ apiKey: 'k', enabled: true, fetch: impl, now: () => now });
    await narrate(alert);
    const other = { ...alert, score: 90 };
    expect((await narrate(other)).source).toBe('template');
    now = LLM_MIN_INTERVAL_MS;
    expect(calls).toHaveLength(1);
    await narrate(other);
    expect(calls).toHaveLength(2);
  });
});
