import { File } from 'expo-file-system';

import { getDeviceId } from '@/lib/device-id';

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
  transcript: string,
  player: PlayerContext,
): Promise<EchoApiResult<{ echoResponse: string }>> {
  return postJson<{ echoResponse: string }>('/api/debrief-response', { transcript, player });
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
