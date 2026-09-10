import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

import { buildEchoSystemPrompt, type PastDebrief, type PlayerContext } from '../lib/echo-prompt.js';

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

function isPastDebrief(value: unknown): value is PastDebrief {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.date === 'string' && typeof record.transcript === 'string' && typeof record.echoResponse === 'string'
  );
}

type ConversationTurn = { transcript: string; echoResponse: string };

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return typeof t.transcript === 'string' && typeof t.echoResponse === 'string';
}

// Bounds the in-session conversation the same way past-debrief history is
// bounded below — a single debrief shouldn't be able to grow the prompt
// without limit either.
const TURN_LIMIT = 20;
const TURN_FIELD_CHAR_LIMIT = 4000;

function toConversationTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isConversationTurn)
    .slice(-TURN_LIMIT)
    .map((t) => ({
      transcript: t.transcript.slice(0, TURN_FIELD_CHAR_LIMIT),
      echoResponse: t.echoResponse.slice(0, TURN_FIELD_CHAR_LIMIT),
    }));
}

// Malformed or missing history degrades to no memory for this request rather
// than failing the debrief outright — memory is a quality improvement, not a
// dependency the whole feature should break on. The cap and truncation are
// enforced here too, not just client-side: the device-id header is soft
// abuse-prevention, not auth, so the prompt budget can't be trusted to the
// caller.
const HISTORY_LIMIT = 5;
const HISTORY_FIELD_CHAR_LIMIT = 600;

function toPastDebriefArray(value: unknown): PastDebrief[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPastDebrief)
    .slice(-HISTORY_LIMIT)
    .map((d) => ({
      date: d.date.slice(0, 64),
      transcript: d.transcript.slice(0, HISTORY_FIELD_CHAR_LIMIT),
      echoResponse: d.echoResponse.slice(0, HISTORY_FIELD_CHAR_LIMIT),
    }));
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

  const { transcript, player, history, turns } = req.body ?? {};
  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'missing_transcript' });
    return;
  }
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  // The current debrief's conversation so far (if any), turned into proper
  // alternating messages so Echo replies with full in-session context, then
  // the new transcript as the latest turn.
  const priorTurns = toConversationTurns(turns);
  const messages = priorTurns.flatMap(
    (t): { role: 'user' | 'assistant'; content: string }[] => [
      { role: 'user' as const, content: t.transcript },
      { role: 'assistant' as const, content: t.echoResponse },
    ],
  );
  messages.push({ role: 'user', content: transcript });

  try {
    const message = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildEchoSystemPrompt(player, toPastDebriefArray(history)),
      messages,
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
