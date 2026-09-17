import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

import type { PlayerContext } from '../lib/echo-prompt.js';

const anthropic = new Anthropic();

// A narrow extraction job, not a conversational one — Haiku is deliberately
// used here (same reasoning as the crisis classifier): cheap and fast
// enough to run after every single turn without adding real latency or
// cost, which matters because this runs far more often than a debrief
// reply does.
const SUMMARY_MODEL = 'claude-haiku-4-5';

type ConversationTurn = { transcript: string; echoResponse: string };

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return typeof t.transcript === 'string' && typeof t.echoResponse === 'string';
}

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

const SYSTEM_PROMPT = `You are extracting a compact, durable memory record from a footballer's debrief conversation with Echo, an AI companion. This is NOT a performance report and NOT advice — it is a factual distillation for future reference, read by Echo itself in later debriefs to notice real patterns.

The conversation may be about a specific match, a training session, or just an open check-in — it doesn't have to be tied to a fixture. Summarize whatever was actually discussed.

Produce two things:
1. A 1-3 sentence factual summary of what the player actually described — events, decisions, how they said they felt. No encouragement, no evaluation, no advice.
2. Up to 5 short "signals" — brief tagged phrases (3-6 words each) capturing anything specific and worth re-mentioning later: a recurring mistake, a mental or emotional pattern (hesitation, blame-shifting, low confidence after an error, fear of a specific situation), a condition that preceded playing well (sleep, arrival time, warm-up, mindset), or a genuine strength moment. Name negative or self-limiting patterns exactly as plainly as positive ones — do not soften, sanitize, or omit them; burying a real pattern here defeats the entire point of keeping it. Each signal should stand alone and still make sense read next to signals from other, unrelated debriefs months later.

Only extract what's genuinely in the conversation. A short or thin debrief should produce a short summary and few or no signals — do not invent texture, mistakes, or patterns that aren't actually there.`;

const SUMMARIZE_TOOL: Anthropic.Tool = {
  name: 'summarize_debrief',
  description: 'Return the compact summary and tagged signals for this debrief conversation.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '1-3 sentence factual summary of the conversation.' },
      signals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 5 short (3-6 word) tagged phrases capturing recurring or notable patterns, positive or negative.',
      },
    },
    required: ['summary', 'signals'],
  },
};

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

  const { turns, player } = req.body ?? {};
  const conversationTurns = toConversationTurns(turns);
  if (conversationTurns.length === 0) {
    res.status(400).json({ error: 'missing_turns' });
    return;
  }
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  const conversationText = conversationTurns
    .map((t, i) => `Turn ${i + 1}:\nPlayer: "${t.transcript}"\nEcho: "${t.echoResponse}"`)
    .join('\n\n');

  try {
    const message = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [SUMMARIZE_TOOL],
      tool_choice: { type: 'tool', name: 'summarize_debrief' },
      messages: [
        {
          role: 'user',
          content: `Player: ${player.positionLabel}, ${player.level}.\n\nThe debrief conversation so far:\n\n${conversationText}\n\nExtract the summary and signals.`,
        },
      ],
    });

    const toolBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'summarize_debrief',
    );
    const input = toolBlock?.input as { summary?: unknown; signals?: unknown } | undefined;
    const summary = typeof input?.summary === 'string' ? input.summary.slice(0, 500) : '';
    const signals = Array.isArray(input?.signals)
      ? input.signals.filter((s): s is string => typeof s === 'string').slice(0, 5).map((s) => s.slice(0, 100))
      : [];

    res.status(200).json({ summary, signals });
  } catch (error) {
    console.error('summarize-debrief failed', error);
    res.status(502).json({ error: 'summarize_failed' });
  }
}
