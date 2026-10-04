import { parseNarrateAlert } from '../../../lib/narrator';
import { narrate } from '../../../lib/serverVoice';

/** POST { alert: { kind, score, trader, evidence } } -> { text, source: 'llm' | 'template' | 'cache' } */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const alert = parseNarrateAlert(body);
  if (!alert) return Response.json({ error: 'expected { alert: { kind, score, trader, evidence } }' }, { status: 400 });
  return Response.json(await narrate(alert));
}
