import OpenAI from 'openai';

// Echo's crisis safety override — see CLAUDE.md ("Safety override") and
// docs/echo-framework.md ("When a player is in real distress").
//
// This is deliberately NOT implemented as an instruction inside Echo's own
// system prompt. A single large persona prompt (character, competency,
// decision framework, tone rules) asking the model to also self-regulate
// around crisis is exactly the "hope it handles it well by default" pattern
// CLAUDE.md says not to rely on — a long, character-heavy prompt is more
// likely to stay in character than break from it cleanly.
//
// Instead: a separate, narrow classifier call with one job, gating a fixed,
// hardcoded response. The crisis message is never LLM-generated, so it
// can't paraphrase away the actual resources or say something unhelpful
// under pressure.

const CLASSIFIER_MODEL = 'gpt-5-mini';

const CLASSIFIER_SYSTEM_PROMPT = `You are a safety classifier for a football (soccer) reflection app, not a conversational assistant.

Players often use hyperbolic language about matches — "I wanted to die when I missed that," "that finish killed me," "I could've cried," "I wanted the ground to swallow me." This is normal football speech and is NOT a crisis signal.

You are only looking for genuine signals of real personal crisis or self-harm risk in the message below — for example: seriously expressing that they don't want to be alive (not as a figure of speech about a missed chance), talking about hurting themselves, or expressing that they've genuinely reached the end of what they can cope with, in a way that reads as being about their life, not their performance in a match.

Respond with exactly one word: YES if there is a genuine crisis signal, or NO if there is not (including if it's just football hyperbole or ordinary frustration). When genuinely unsure, answer YES — a false alarm costs far less than missing a real signal.`;

export async function containsCrisisSignal(openai: OpenAI, transcript: string): Promise<boolean> {
  try {
    const completion = await openai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      // Generous headroom, not a cost-saving corner to cut: on a reasoning
      // model, internal reasoning tokens are drawn from this same budget
      // before any visible output — a tight cap here doesn't just truncate
      // the answer, it can silently consume the whole budget and leave an
      // EMPTY response that reads as "no crisis" rather than as a failure.
      max_completion_tokens: 500,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
    });
    const text = (completion.choices[0]?.message.content ?? '').trim().toUpperCase();
    if (text.startsWith('YES')) return true;
    if (text.startsWith('NO')) return false;
    // An empty or unparseable response is an anomaly, not a "NO" — the
    // prompt's own rule applies here too: when genuinely unsure, treat it
    // as a signal rather than silently waving it through.
    console.error('Crisis classifier returned an empty/unparseable response — failing toward crisis', {
      rawText: text,
      finishReason: completion.choices[0]?.finish_reason,
    });
    return true;
  } catch (error) {
    // A classifier failure is a system error, not evidence of crisis — fail
    // open to the normal debrief rather than blocking the whole feature,
    // but log it loudly since this path matters.
    console.error('Crisis classifier failed — proceeding without override', error);
    return false;
  }
}

export const CRISIS_RESPONSE = `That's a lot to be carrying, and this isn't something I can help with — please talk to someone who can, right now.

In the UK: Samaritans, free, any time — call 116 123, or text SHOUT to 85258.
If you're in immediate danger, call 999.

If you're outside the UK, please reach out to a local crisis line or someone you trust right now. You deserve real support, not an app.`;
