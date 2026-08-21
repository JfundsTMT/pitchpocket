import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

import { buildEchoSystemPrompt, type PlayerContext } from '../lib/echo-prompt.js';

const anthropic = new Anthropic();

// ALWAYS claude-opus-4-8 unless explicitly told otherwise — see server/README or
// ask the founder before changing. Haiku 4.5 (`claude-haiku-4-5`) is a much
// cheaper option if cost becomes a concern at scale; this is a deliberate,
// not automatic, downgrade.
const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-opus-4-8';

function isPlayerContext(value: unknown): value is PlayerContext {
  if (!value || typeof value !== 'object') return false;
  const requiredKeys: (keyof PlayerContext)[] = [
    'positionLabel',
    'level',
    'archetypeName',
    'archetypeDescription',
    'biggestStrength',
    'greatestWeakness',
    'ambition',
  ];
  return requiredKeys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
}

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

  const { transcript, player } = req.body ?? {};
  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'missing_transcript' });
    return;
  }
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildEchoSystemPrompt(player),
      messages: [{ role: 'user', content: transcript }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'empty_response' });
      return;
    }
    res.status(200).json({ echoResponse: textBlock.text });
  } catch (error) {
    console.error('debrief-response failed', error);
    res.status(502).json({ error: 'echo_response_failed' });
  }
}
