import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

import { getHistoryDepth, type PastDebrief, type PlayerContext } from '../lib/echo-prompt.js';

const anthropic = new Anthropic();

// Same model policy as debrief-response.ts: ALWAYS claude-opus-4-8 unless
// the founder explicitly decides otherwise.
const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-opus-4-8';

// Synthesis reads a wide history — the whole point is patterns across a
// season — but still bounded so the prompt can't grow without limit.
// Summaries are compact enough that this can cover far more debriefs than
// the old raw-transcript approach could.
const HISTORY_LIMIT = 30;
const SUMMARY_CHAR_LIMIT = 400;
const SIGNALS_LIMIT = 6;

const SYSTEM_PROMPT = `You are the intelligence behind PitchPocket, drafting a player's Flow Recipe: the personal conditions that precede THEIR best football, drawn only from their own debriefs.

Hard rules:
- Every item must be grounded in something the player actually said — a condition they themselves connected (or clearly implied) to playing well, feeling sharp, or being in flow. Sleep, arrival time, pre-match routine, mindset, first actions of the game, anything — but only if THEIR words support it.
- Never include textbook advice, generic sports-psychology filler, or anything you cannot point to in their debriefs. An empty or short recipe is correct when the evidence is thin; a padded one is a lie.
- Labels are short and personal, phrased as reminders in plain football language ("Simple first pass", "Arrive early", "8+ hours sleep") — not clinical, not motivational-poster.
- Maximum 6 items. Fewer is normal. Zero is acceptable.
- For each item, the evidence field is one short line saying what they said that supports it, paraphrased plainly.`;

const DRAFT_TOOL: Anthropic.Tool = {
  name: 'draft_flow_recipe',
  description: 'Return the drafted flow recipe items.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short reminder in the player\'s language, e.g. "Arrive early".' },
            evidence: { type: 'string', description: 'One line: what the player said that supports this.' },
          },
          required: ['label', 'evidence'],
        },
      },
    },
    required: ['items'],
  },
};

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

  const { player, history } = req.body ?? {};
  if (!isPlayerContext(player)) {
    res.status(400).json({ error: 'missing_player_context' });
    return;
  }

  const debriefs = toPastDebriefArray(history);
  if (debriefs.length === 0) {
    // No debriefs means no evidence — an honest empty draft, no model call.
    res.status(200).json({ items: [] });
    return;
  }

  const historyText = debriefs
    .map((d, i) => {
      const signalsLine = d.signals.length > 0 ? `\nSignals: ${d.signals.join(', ')}` : '';
      return `Debrief ${i + 1} (${new Date(d.date).toDateString()}): ${d.summary}${signalsLine}`;
    })
    .join('\n\n');

  // Same reasoning as the debrief prompt's history tiers: a recipe drawn
  // from 2 debriefs should read very differently from one drawn from a real
  // season, or every early recipe overclaims structure that isn't there yet.
  const depth = getHistoryDepth(debriefs);
  const depthInstruction =
    depth === 'thin'
      ? "You only have a handful of debriefs to draw from — be especially conservative. A short or empty recipe is far better than inventing structure from 2-4 data points; only include something a condition was clearly connected to more than once."
      : depth === 'building'
        ? 'You have a growing but still moderate body of debriefs — items are fine when a condition has shown up more than once, but stay cautious about anything mentioned only a single time.'
        : "You have a real season's worth of debriefs — you can draw confidently on conditions that have shown up repeatedly across many of them.";

  try {
    const message = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [DRAFT_TOOL],
      tool_choice: { type: 'tool', name: 'draft_flow_recipe' },
      messages: [
        {
          role: 'user',
          content: `Player profile: ${player.positionLabel}, ${player.level}, archetype "${player.archetypeName}". Self-reported strength: ${player.biggestStrength}. Self-reported weakness: ${player.greatestWeakness}.\n\n${depthInstruction}\n\nTheir recent debriefs, oldest first:\n\n${historyText}\n\nDraft their Flow Recipe from this evidence only.`,
        },
      ],
    });

    const toolBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'draft_flow_recipe',
    );
    const rawItems = toolBlock ? (toolBlock.input as { items?: unknown }).items : undefined;
    const items = Array.isArray(rawItems)
      ? rawItems
          .filter(
            (i): i is { label: string; evidence: string } =>
              !!i && typeof i === 'object' && typeof (i as { label?: unknown }).label === 'string',
          )
          .slice(0, 6)
          .map((i) => ({
            label: i.label.slice(0, 120),
            evidence: typeof i.evidence === 'string' ? i.evidence.slice(0, 300) : '',
          }))
      : [];

    res.status(200).json({ items });
  } catch (error) {
    console.error('flow-recipe synthesis failed', error);
    res.status(502).json({ error: 'flow_recipe_failed' });
  }
}
