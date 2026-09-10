import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';
import { addTombstone } from '@/lib/sync-tombstones';

const STORAGE_KEY = 'pitchpocket.debriefHistory.v1';

export type DebriefTurn = {
  transcript: string;
  echoResponse: string;
};

export type DebriefRecord = {
  id: string;
  fixtureId?: string;
  turns: DebriefTurn[];
  createdAt: string;
};

function isDebriefTurn(value: unknown): value is DebriefTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return typeof t.transcript === 'string' && typeof t.echoResponse === 'string';
}

export async function loadDebriefHistory(): Promise<DebriefRecord[]> {
  const parsed = await readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  // Drop malformed entries rather than letting one bad record break every
  // screen that maps over the list. A record needs at least one real turn.
  return parsed.filter((r): r is DebriefRecord => {
    if (!r || typeof r !== 'object') return false;
    const record = r as Record<string, unknown>;
    return (
      typeof record.id === 'string' &&
      typeof record.createdAt === 'string' &&
      Array.isArray(record.turns) &&
      record.turns.length > 0 &&
      record.turns.every(isDebriefTurn)
    );
  });
}

// Creates a new record with its first turn — called when a debrief's first
// exchange completes.
export async function createDebriefRecord(input: {
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
}): Promise<DebriefRecord> {
  const history = await loadDebriefHistory();
  const record: DebriefRecord = {
    id: generateId(),
    fixtureId: input.fixtureId,
    turns: [{ transcript: input.transcript, echoResponse: input.echoResponse }],
    createdAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, [...history, record]);
  requestPush();
  return record;
}

// Appends a reply exchange to an existing debrief — called each time the
// player replies within the same conversation, so nothing is lost if they
// leave mid-conversation.
export async function appendDebriefTurn(recordId: string, turn: DebriefTurn): Promise<DebriefRecord | null> {
  const history = await loadDebriefHistory();
  let updated: DebriefRecord | null = null;
  const next = history.map((record) => {
    if (record.id !== recordId) return record;
    updated = { ...record, turns: [...record.turns, turn] };
    return updated;
  });
  if (!updated) return null;
  await writeJson(STORAGE_KEY, next);
  requestPush();
  return updated;
}

export async function deleteDebriefRecord(id: string): Promise<void> {
  const history = await loadDebriefHistory();
  await writeJson(STORAGE_KEY, history.filter((r) => r.id !== id));
  await addTombstone('debriefs', id);
  requestPush();
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replaceAllDebriefs(history: DebriefRecord[]): Promise<void> {
  await writeJson(STORAGE_KEY, history);
}

/** Fresh-save / account-switch use: wipe locally without tombstoning (the cloud copy survives). */
export async function clearAllDebriefs(): Promise<void> {
  await writeJson(STORAGE_KEY, []);
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
// each capped in length, oldest first so Echo reads it as a timeline. Each
// past debrief's turns are flattened into one back-and-forth block so Echo
// still sees the shape of a conversation, not just its last line.
const RECENT_DEBRIEF_LIMIT = 5;
const FIELD_CHAR_LIMIT = 500;

export function buildRecentDebriefContext(history: DebriefRecord[]): PastDebrief[] {
  return [...history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_DEBRIEF_LIMIT)
    .reverse()
    .map((record) => ({
      date: record.createdAt,
      transcript: truncate(record.turns.map((t) => t.transcript).join(' … ')),
      echoResponse: truncate(record.turns.map((t) => t.echoResponse).join(' … ')),
    }));
}

function truncate(text: string): string {
  return text.length > FIELD_CHAR_LIMIT ? `${text.slice(0, FIELD_CHAR_LIMIT)}…` : text;
}
