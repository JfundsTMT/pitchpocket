import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI, { toFile } from 'openai';

// Matches the client's recording cap (LOW_QUALITY preset, duration-limited) with
// headroom below Vercel's hard 4.5MB request body ceiling. Decoded buffer, not the
// base64 string, since base64 inflates the wire size by ~33%.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// OpenAI's audio transcription endpoint has a known, widely-reported pattern of raw
// ECONNRESET failures on file uploads from serverless environments — traced to the
// SDK's default HTTP client resolving to the `node-fetch` package rather than Node's
// native (undici-based) fetch, which handles large multipart uploads more reliably.
// Node's native fetch, though, requires an explicit `duplex: 'half'` on any request
// with a streamed body — a well-known undici quirk — and the OpenAI SDK doesn't set
// it, so a bare fetch override 400s. This wrapper adds it whenever a body is present.
const duplexSafeFetch: typeof fetch = (input, init) => {
  if (init?.body) {
    return fetch(input, { ...init, duplex: 'half' } as RequestInit);
  }
  return fetch(input, init);
};

// maxRetries: 0 — the SDK's internal retry re-sends the same streamed request body,
// which undici rejects on a second attempt ("Response body object should not be
// disturbed or locked"). The app's own UI already retries with a fresh request on
// failure, so SDK-level auto-retry here is both redundant and actively broken.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, fetch: duplexSafeFetch, maxRetries: 0 });
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe';

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

  const { audioBase64, mimeType } = req.body ?? {};
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    res.status(400).json({ error: 'missing_audio' });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(audioBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'invalid_audio_encoding' });
    return;
  }

  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: 'audio_too_large' });
    return;
  }

  try {
    const filename = mimeType === 'audio/wav' ? 'debrief.wav' : 'debrief.m4a';
    const file = await toFile(buffer, filename);
    const transcription = await openai.audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file,
    });
    res.status(200).json({ transcript: transcription.text });
  } catch (error) {
    console.error('transcribe failed', error);
    res.status(502).json({ error: 'transcription_failed' });
  }
}
