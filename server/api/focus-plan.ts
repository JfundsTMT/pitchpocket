import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

import type { PlayerContext } from '../lib/echo-prompt.js';

const openai = new OpenAI();

// Same model policy as debrief-response.ts: ALWAYS gpt-5 unless the founder
// explicitly decides otherwise. This fires rarely (only when a player
// explicitly starts a focus block, not on every turn), so the cost of the
// better model is negligible here.
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

const LABEL_CHAR_LIMIT = 200;
const CONTEXT_FIELD_CHAR_LIMIT = 2000;

// This is a deliberate exception to Echo's usual restraint: everywhere else
// (debrief replies, Flow Recipe) Echo only ever reflects back what's
// evidenced, never prescribes. A focus block is the one place CLAUDE.md
// has Echo propose something actionable — but only once the player has
// already pinned the insight themselves, so this is drafting the "how" for
// something they've already agreed is real, not inventing the "what."
const SYSTEM_PROMPT = `You are Echo, drafting a short, concrete training focus for a footballer who just pinned a real insight about their own game and chose to actively work on it.

Ground everything in the specific moment that led to this insight — the exchange below is why this matters to them, not generic context. Never invent structure the moment doesn't support.

Hard rules:
- 2 to 4 short lines, each one concrete and actionable in plain football language — a specific thing to try, watch for, or say to themselves, not a category or a platitude.
- Never generic sports-psychology filler ("stay positive," "trust your training," "visualize success"). Every line should read like it could only apply to THIS player and THIS moment.
- Never clinical or coaching-report language. Write like you're speaking to them.
- Never invent a drill, rep count, or numeric target you have no basis for.
- Fewer, sharper lines beat more, vaguer ones — 2 excellent lines beats 4 padded ones.`;

const FOCUS_PLAN_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'draft_focus_plan',
    description: 'Return the drafted focus plan lines.',
    parameters: {
      type: 'object',
      properties: {
        plan: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 short, concrete, actionable lines in plain football language.',
        },
      },
      required: ['plan'],
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

  const { player, label, context } = req.body ?? {};
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }
  if (!label || typeof label !== 'string') {
    res.status(400).json({ error: 'missing_label' });
    return;
  }
  const transcript = typeof context?.transcript === 'string' ? context.transcript.slice(0, CONTEXT_FIELD_CHAR_LIMIT) : '';
  const echoResponse = typeof context?.echoResponse === 'string' ? context.echoResponse.slice(0, CONTEXT_FIELD_CHAR_LIMIT) : '';

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      max_completion_tokens: 512,
      tools: [FOCUS_PLAN_TOOL],
      tool_choice: { type: 'function', function: { name: 'draft_focus_plan' } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Player: ${player.positionLabel}, ${player.level}.\n\nThe insight they just pinned: "${label.slice(0, LABEL_CHAR_LIMIT)}"\n\nThe exchange that led to it:\nPlayer: "${transcript}"\nEcho: "${echoResponse}"\n\nDraft their focus plan.`,
        },
      ],
    });

    const toolCall = completion.choices[0]?.message.tool_calls?.find((call) => call.function.name === 'draft_focus_plan');
    let plan: string[] = [];
    if (toolCall) {
      try {
        const args = JSON.parse(toolCall.function.arguments) as { plan?: unknown };
        plan = Array.isArray(args.plan)
          ? args.plan.filter((p): p is string => typeof p === 'string').slice(0, 4).map((p) => p.slice(0, 300))
          : [];
      } catch (error) {
        console.error('draft_focus_plan arguments were not valid JSON', error);
      }
    }

    res.status(200).json({ plan });
  } catch (error) {
    console.error('focus-plan failed', error);
    res.status(502).json({ error: 'focus_plan_failed' });
  }
}
