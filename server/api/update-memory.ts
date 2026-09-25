import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

import type { PastDebrief, PlayerContext } from '../lib/echo-prompt.js';

const openai = new OpenAI();

// A narrow synthesis job, not a conversational one — same reasoning as
// summarize-debrief.ts: cheap and fast enough to run at the close of every
// debrief without adding real latency or cost.
const MEMORY_MODEL = 'gpt-5-mini';

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

const DEBRIEF_LIMIT = 30;
const SUMMARY_CHAR_LIMIT = 400;
const SIGNALS_LIMIT = 6;
const MEMORY_LIMIT = 20;
const MEMORY_FACT_CHAR_LIMIT = 200;

function toPastDebriefArray(value: unknown): PastDebrief[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPastDebrief)
    .slice(-DEBRIEF_LIMIT)
    .map((d) => ({
      date: d.date.slice(0, 64),
      summary: d.summary.slice(0, SUMMARY_CHAR_LIMIT),
      signals: d.signals.slice(0, SIGNALS_LIMIT).map((s) => s.slice(0, 100)),
    }));
}

function toMemoryFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is string => typeof f === 'string')
    .slice(0, MEMORY_LIMIT)
    .map((f) => f.slice(0, MEMORY_FACT_CHAR_LIMIT));
}

const SYSTEM_PROMPT = `You maintain a compact, evolving memory of a footballer — the way a person who knows someone well would remember them: a handful of durable, specific facts, not a replay of every conversation.

You'll be given the player's existing memory (if any) and their recent debrief history (summaries + tagged signals, oldest first — these may be about specific matches, training, or open check-ins). Return the complete, current set of memory facts that should exist now.

Rules:
- Only include a fact if it's genuinely evidenced by recurrence — the same signal or theme appearing across multiple SEPARATE debriefs. Never include something from a single occurrence, no matter how notable it seemed in the moment.
- An existing memory fact can be carried forward as-is if it's still supported by the history. It can also be sharpened or merged with a newly-recurring related fact.
- Drop a fact if the history now contradicts it (e.g. a weakness that's clearly eased across several recent debriefs) — memory should reflect the player's current, honest state, not accumulate forever.
- Facts must be short (one sentence), specific, and durable — not "had a good day" but something like "hesitates on one-on-one finishing chances under pressure" or "plays with more composure after arriving early to warm up."
- Name negative or self-limiting patterns exactly as plainly as positive ones — do not soften or omit a real recurring pattern.
- Maximum 12 facts. Prioritize what's most currently true and most likely to matter in a future conversation. Fewer, sharper facts beat many vague ones.
- If nothing has genuinely recurred yet, return an empty list rather than inventing texture.`;

const UPDATE_MEMORY_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_memory',
    description: "Return the complete, current set of memory facts for this player.",
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          items: { type: 'string' },
          description: 'The complete current set of durable memory facts, max 12.',
        },
      },
      required: ['facts'],
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

  const { player, existingMemory, recentDebriefs } = req.body ?? {};
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  const memory = toMemoryFacts(existingMemory);
  const debriefs = toPastDebriefArray(recentDebriefs);
  if (debriefs.length === 0) {
    // No history means nothing new to derive — carry the existing memory
    // forward unchanged rather than making a model call.
    res.status(200).json({ facts: memory });
    return;
  }

  const memoryText = memory.length > 0 ? memory.map((f) => `- ${f}`).join('\n') : '(none yet)';
  const debriefText = debriefs
    .map((d, i) => {
      const signalsLine = d.signals.length > 0 ? `\nSignals: ${d.signals.join(', ')}` : '';
      return `Debrief ${i + 1} (${new Date(d.date).toDateString()}): ${d.summary}${signalsLine}`;
    })
    .join('\n\n');

  try {
    const completion = await openai.chat.completions.create({
      model: MEMORY_MODEL,
      max_completion_tokens: 768,
      reasoning_effort: 'low',
      tools: [UPDATE_MEMORY_TOOL],
      tool_choice: { type: 'function', function: { name: 'update_memory' } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Player: ${player.positionLabel}, ${player.level}.\n\nExisting memory:\n${memoryText}\n\nRecent debriefs, oldest first:\n\n${debriefText}\n\nReturn the complete, current set of memory facts.`,
        },
      ],
    });

    const toolCall = completion.choices[0]?.message.tool_calls?.find((call) => call.function.name === 'update_memory');
    if (!toolCall) {
      res.status(200).json({ facts: memory });
      return;
    }
    let facts: string[] = memory;
    try {
      const args = JSON.parse(toolCall.function.arguments) as { facts?: unknown };
      if (Array.isArray(args.facts)) {
        facts = args.facts.filter((f): f is string => typeof f === 'string').slice(0, 12).map((f) => f.slice(0, MEMORY_FACT_CHAR_LIMIT));
      }
    } catch (error) {
      console.error('update_memory arguments were not valid JSON', error);
    }

    res.status(200).json({ facts });
  } catch (error) {
    console.error('update-memory failed', error);
    res.status(502).json({ error: 'update_memory_failed' });
  }
}
