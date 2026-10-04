import { createNarrator } from './narrator';
import { createSpeaker } from './speech';

// Server-only singletons shared by /api/narrate and /api/speak, so both use one cache and one rate limit per instance.
// NARRATOR_ENABLED=false turns off both the LLM text and the ElevenLabs voice (the template and browser voice remain).
const enabled = process.env.NARRATOR_ENABLED !== 'false';

export const narrate = createNarrator({
  apiKey: process.env.LLM_API_KEY,
  enabled,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
});

export const speak = createSpeaker({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID,
  modelId: process.env.ELEVENLABS_MODEL_ID,
  enabled,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
});
