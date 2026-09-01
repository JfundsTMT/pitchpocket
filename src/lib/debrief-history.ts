import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'pitchpocket.debriefHistory.v1';

export type DebriefRecord = {
  id: string;
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
  createdAt: string;
};

export async function loadDebriefHistory(): Promise<DebriefRecord[]> {
  return readJson<DebriefRecord[]>(STORAGE_KEY, []);
}

export async function addDebriefRecord(input: {
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
}): Promise<DebriefRecord> {
  const history = await loadDebriefHistory();
  const record: DebriefRecord = {
    id: generateId(),
    fixtureId: input.fixtureId,
    transcript: input.transcript,
    echoResponse: input.echoResponse,
    createdAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, [...history, record]);
  return record;
}

export async function deleteDebriefRecord(id: string): Promise<void> {
  const history = await loadDebriefHistory();
  await writeJson(STORAGE_KEY, history.filter((r) => r.id !== id));
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export type PastDebrief = {
  date: string;
  transcript: string;
  echoResponse: string;
};

// Bounded context sent to Echo so the payload/cost doesn't grow without limit
// as a player's history accumulates over a season — most recent N debriefs,
// each capped in length, oldest first so Echo reads it as a timeline.
const RECENT_DEBRIEF_LIMIT = 5;
const FIELD_CHAR_LIMIT = 500;

export function buildRecentDebriefContext(history: DebriefRecord[]): PastDebrief[] {
  return [...history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_DEBRIEF_LIMIT)
    .reverse()
    .map((record) => ({
      date: record.createdAt,
      transcript: truncate(record.transcript),
      echoResponse: truncate(record.echoResponse),
    }));
}

function truncate(text: string): string {
  return text.length > FIELD_CHAR_LIMIT ? `${text.slice(0, FIELD_CHAR_LIMIT)}…` : text;
}
