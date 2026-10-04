import { createNarrator, parseNarrateAlert } from '../../../lib/narrator';

// One narrator per server instance: the cache and rate limit live as long as the instance does.
const narrate = createNarrator({
  apiKey: process.env.LLM_API_KEY,
  enabled: process.env.NARRATOR_ENABLED !== 'false', // kill switch: set NARRATOR_ENABLED=false
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
});

/** POST { alert: { kind, score, trader, evidence } } -> { text, source: 'llm' | 'template' | 'cache' } */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const alert = parseNarrateAlert(body);
  if (!alert) return Response.json({ error: 'expected { alert: { kind, score, trader, evidence } }' }, { status: 400 });
  return Response.json(await narrate(alert));
}
