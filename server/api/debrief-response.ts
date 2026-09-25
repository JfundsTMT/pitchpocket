import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

import { CRISIS_RESPONSE, containsCrisisSignal } from '../lib/crisis-check.js';
import { buildEchoSystemPrompt, type PlayerContext } from '../lib/echo-prompt.js';

const openai = new OpenAI();

// ALWAYS gpt-5 unless explicitly told otherwise — ask the founder before
// changing. gpt-5-mini is a much cheaper option if cost becomes a concern
// at scale; this is a deliberate, not automatic, downgrade.
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-5';

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

type ConversationTurn = { transcript: string; echoResponse: string };

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return typeof t.transcript === 'string' && typeof t.echoResponse === 'string';
}

// Bounds the in-session conversation so a single debrief can't grow the
// prompt without limit.
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

// Malformed or missing memory degrades to no memory for this request rather
// than failing the debrief outright. Bounded here too, not just
// client-side: the device-id header is soft abuse-prevention, not auth, so
// the prompt budget can't be trusted to the caller.
const MEMORY_LIMIT = 20;
const MEMORY_FACT_CHAR_LIMIT = 200;

function toMemoryFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is string => typeof f === 'string')
    .slice(0, MEMORY_LIMIT)
    .map((f) => f.slice(0, MEMORY_FACT_CHAR_LIMIT));
}

// Optional tool so Echo can emit a structured, pinnable label alongside its
// natural-language offer — see CLAUDE.md ("Mind map" / nodes). The app
// can't reliably turn free text into a "Pin this" button; this gives it
// something concrete to act on without changing how Echo actually talks.
const OFFER_NODE_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'offer_node',
    description:
      "Call this only when you're offering to pin a genuine discovery to the player's mind map, in the same turn as that offer in your reply. Do not call this for anything else — most replies never call it.",
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: "Short label for the node, in the player's own words, e.g. \"Earlier release -> sharper vision\".",
        },
      },
      required: ['label'],
    },
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

  const { transcript, player, memory, turns } = req.body ?? {};
  if (!transcript || typeof transcript !== 'string') {
    res.status(400).json({ error: 'missing_transcript' });
    return;
  }
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  // Non-negotiable per CLAUDE.md: checked before anything else, on every
  // message (not just the first), and short-circuits the whole response
  // with a fixed message if it fires.
  if (await containsCrisisSignal(openai, transcript)) {
    res.status(200).json({ echoResponse: CRISIS_RESPONSE });
    return;
  }

  // The current debrief's conversation so far (if any), turned into proper
  // alternating messages so Echo replies with full in-session context, then
  // the new transcript as the latest turn.
  const priorTurns = toConversationTurns(turns);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildEchoSystemPrompt(player, toMemoryFacts(memory)) },
  ];
  for (const t of priorTurns) {
    messages.push({ role: 'user', content: t.transcript });
    messages.push({ role: 'assistant', content: t.echoResponse });
  }
  messages.push({ role: 'user', content: transcript });

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      max_completion_tokens: 1024,
      messages,
      tools: [OFFER_NODE_TOOL],
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0]?.message;
    const echoResponse = responseMessage?.content;
    if (!echoResponse) {
      res.status(502).json({ error: 'empty_response' });
      return;
    }

    const toolCall = responseMessage.tool_calls?.find((call) => call.function.name === 'offer_node');
    let nodeOffer: { label: string } | undefined;
    if (toolCall) {
      try {
        const args = JSON.parse(toolCall.function.arguments) as { label?: unknown };
        if (typeof args.label === 'string' && args.label.trim().length > 0) {
          nodeOffer = { label: args.label.trim() };
        }
      } catch (error) {
        console.error('offer_node arguments were not valid JSON', error);
      }
    }

    res.status(200).json({ echoResponse, nodeOffer });
  } catch (error) {
    console.error('debrief-response failed', error);
    res.status(502).json({ error: 'echo_response_failed' });
  }
}
