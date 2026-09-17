import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

import { CRISIS_RESPONSE, containsCrisisSignal } from '../lib/crisis-check.js';
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
    typeof record.date === 'string' &&
    typeof record.summary === 'string' &&
    Array.isArray(record.signals) &&
    record.signals.every((s) => typeof s === 'string')
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
// caller. Summaries are compact, so this can afford a much wider window
// than the old raw-transcript approach could — see debrief-history.ts.
const HISTORY_LIMIT = 30;
const SUMMARY_CHAR_LIMIT = 400;
const SIGNALS_LIMIT = 6;

function toPastDebriefArray(value: unknown): PastDebrief[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPastDebrief)
    .slice(-HISTORY_LIMIT)
    .map((d) => ({
      date: d.date.slice(0, 64),
      summary: d.summary.slice(0, SUMMARY_CHAR_LIMIT),
      signals: d.signals.slice(0, SIGNALS_LIMIT).map((s) => s.slice(0, 100)),
    }));
}

// Optional tool so Echo can emit a structured, pinnable label alongside its
// natural-language offer — see CLAUDE.md ("Mind map" / nodes). The app
// can't reliably turn free text into a "Pin this" button; this gives it
// something concrete to act on without changing how Echo actually talks.
const OFFER_NODE_TOOL: Anthropic.Tool = {
  name: 'offer_node',
  description:
    "Call this only when you're offering to pin a genuine, player-authored discovery to their mind map, in the same turn as that offer in your reply. Do not call this for anything else — most replies never call it.",
  input_schema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: "Short label for the node, in the player's own words, e.g. \"Earlier release -> sharper vision\".",
      },
    },
    required: ['label'],
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

  const { transcript, player, history, turns } = req.body ?? {};
  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'missing_transcript' });
    return;
  }
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  // Non-negotiable per CLAUDE.md: checked before anything else, on every
  // message (not just the first), and short-circuits the whole four-layer
  // method with a fixed response if it fires.
  if (await containsCrisisSignal(anthropic, transcript)) {
    res.status(200).json({ echoResponse: CRISIS_RESPONSE });
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
      tools: [OFFER_NODE_TOOL],
      tool_choice: { type: 'auto' },
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'empty_response' });
      return;
    }

    const toolUseBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'offer_node',
    );
    const label = toolUseBlock ? (toolUseBlock.input as { label?: unknown }).label : undefined;
    const nodeOffer = typeof label === 'string' && label.trim().length > 0 ? { label: label.trim() } : undefined;

    res.status(200).json({ echoResponse: textBlock.text, nodeOffer });
  } catch (error) {
    console.error('debrief-response failed', error);
    res.status(502).json({ error: 'echo_response_failed' });
  }
}
