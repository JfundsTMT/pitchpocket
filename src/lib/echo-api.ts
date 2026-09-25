import { File } from 'expo-file-system';

import { getDeviceId } from '@/lib/device-id';
import type { DebriefTurn, PastDebrief } from '@/lib/debrief-history';

const BASE_URL = process.env.EXPO_PUBLIC_ECHO_API_BASE_URL ?? 'https://pitchpocket-server.vercel.app';

const REQUEST_TIMEOUT_MS = 45_000;

export type PlayerContext = {
  positionLabel: string;
  level: string;
  archetypeName: string;
  archetypeDescription: string;
  biggestStrength: string;
  greatestWeakness: string;
  ambition: string;
};

export type EchoApiError =
  | { kind: 'no_network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'audio_too_large'; message: string }
  | { kind: 'server_error'; message: string };

export type EchoApiResult<T> = { ok: true; data: T } | { ok: false; error: EchoApiError };

export async function transcribeAudio(fileUri: string): Promise<EchoApiResult<{ transcript: string }>> {
  const file = new File(fileUri);
  const audioBase64 = await file.base64();

  return postJson<{ transcript: string }>('/api/transcribe', {
    audioBase64,
    mimeType: 'audio/m4a',
  });
}

export async function getEchoResponse(
  turnsSoFar: DebriefTurn[],
  transcript: string,
  player: PlayerContext,
  memory: string[],
): Promise<EchoApiResult<{ echoResponse: string; nodeOffer?: { label: string } }>> {
  return postJson<{ echoResponse: string; nodeOffer?: { label: string } }>('/api/debrief-response', {
    turns: turnsSoFar,
    transcript,
    player,
    memory,
  });
}

export async function synthesizeFlowRecipe(
  player: PlayerContext,
  history: PastDebrief[],
): Promise<EchoApiResult<{ items: { label: string; evidence: string }[] }>> {
  return postJson<{ items: { label: string; evidence: string }[] }>('/api/flow-recipe', { player, history });
}

// Regenerates the running summary+signals for a debrief conversation.
// Called after every turn, not just on "Finish" — fire-and-forget from the
// UI's perspective, same as sync: never on the critical path, failures are
// swallowed since a missing summary just falls back to raw transcript.
export async function summarizeDebrief(
  turns: DebriefTurn[],
  player: PlayerContext,
): Promise<EchoApiResult<{ summary: string; signals: string[] }>> {
  return postJson<{ summary: string; signals: string[] }>('/api/summarize-debrief', { turns, player });
}

// Regenerates the player's durable memory — a compact, evolving set of
// facts, not a replay of every debrief (see player-memory.ts /
// server/api/update-memory.ts). Called once at the close of a debrief
// (not every turn, unlike summarizeDebrief), since it's a step-back
// synthesis over recent history rather than a per-turn record.
export async function updateMemory(
  player: PlayerContext,
  existingMemory: string[],
  recentDebriefs: PastDebrief[],
): Promise<EchoApiResult<{ facts: string[] }>> {
  return postJson<{ facts: string[] }>('/api/update-memory', { player, existingMemory, recentDebriefs });
}

// Drafts a short, concrete focus plan for a node the player just chose to
// actively train on — a deliberate exception to Echo's usual "only reflect
// back what's evidenced" restraint, see server/api/focus-plan.ts.
export async function draftFocusPlan(
  player: PlayerContext,
  label: string,
  context: { transcript: string; echoResponse: string },
): Promise<EchoApiResult<{ plan: string[] }>> {
  return postJson<{ plan: string[] }>('/api/focus-plan', { player, label, context });
}

async function postJson<T>(path: string, body: unknown): Promise<EchoApiResult<T>> {
  const deviceId = await getDeviceId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 413) {
      return { ok: false, error: { kind: 'audio_too_large', message: 'That recording is too long — try a shorter one.' } };
    }
    if (!response.ok) {
      return { ok: false, error: { kind: 'server_error', message: `Server error (${response.status})` } };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout', message: 'That took too long. Want to try again?' } };
    }
    return { ok: false, error: { kind: 'no_network', message: 'No connection — check your signal and try again.' } };
  } finally {
    clearTimeout(timeoutId);
  }
}
