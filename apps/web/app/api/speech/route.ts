import { parseNarrateAlert } from '../../../lib/narrator';
import { createSpeech } from '../../../lib/speech';

const speech = createSpeech({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID, // empty or unset -> Brian (DEFAULT_VOICE_ID)
  modelId: process.env.ELEVENLABS_MODEL_ID,
  enabled: process.env.NARRATOR_ENABLED !== 'false',
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
});

export function GET() {
  return Response.json({ available: Boolean(process.env.ELEVENLABS_API_KEY) && process.env.NARRATOR_ENABLED !== 'false' });
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    body = JSON.parse(raw);
  } catch { return new Response(null, { status: 400 }); }
  const alert = parseNarrateAlert(body);
  if (!alert) return new Response(null, { status: 400 });
  const result = await speech(alert);
  if (result.status !== 200) return new Response(null, { status: result.status });
  return new Response(new Blob([result.audio], { type: 'audio/mpeg' }), {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, no-store' },
  });
}
