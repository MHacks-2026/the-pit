import { parseNarrateAlert } from '../../../lib/narrator';
import { narrate, speak } from '../../../lib/serverVoice';

/**
 * POST { alert } -> the Cop's sentence as ElevenLabs audio (audio/mpeg, sentence in the x-narration header), or JSON
 * { text, audio: false, reason } so the Big Screen can use the browser voice. Takes an alert rather than free text so
 * the endpoint can only ever voice the narrator's own sentence, never arbitrary text on our ElevenLabs credits.
 */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const alert = parseNarrateAlert(body);
  if (!alert) return Response.json({ error: 'expected { alert: { kind, score, trader, evidence } }' }, { status: 400 });
  const { text } = await narrate(alert);
  const speech = await speak(text);
  if (!speech.audio) return Response.json({ text, audio: false, reason: speech.reason });
  return new Response(new Blob([speech.audio], { type: 'audio/mpeg' }), {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-narration': encodeURIComponent(text) },
  });
}
