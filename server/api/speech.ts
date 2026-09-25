import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const openai = new OpenAI();

// gpt-4o-mini-tts specifically (not tts-1/tts-1-hd) since it's the only one
// that supports `instructions` — steering delivery (pacing, warmth,
// restraint) matters here, not just picking a voice.
const SPEECH_MODEL = 'gpt-4o-mini-tts';

const VALID_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'];

const TEXT_CHAR_LIMIT = 4000;
const INSTRUCTIONS_CHAR_LIMIT = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const deviceId = req.headers['x-device-id'];
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(401).json({ error: 'missing_device_id' });
    return;
  }

  const { text, voice, instructions } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'missing_text' });
    return;
  }
  const chosenVoice = typeof voice === 'string' && VALID_VOICES.includes(voice) ? voice : 'onyx';

  try {
    const speech = await openai.audio.speech.create({
      model: SPEECH_MODEL,
      voice: chosenVoice,
      input: text.slice(0, TEXT_CHAR_LIMIT),
      instructions: typeof instructions === 'string' ? instructions.slice(0, INSTRUCTIONS_CHAR_LIMIT) : undefined,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(buffer);
  } catch (error) {
    console.error('speech synthesis failed', error);
    res.status(502).json({ error: 'speech_failed' });
  }
}
