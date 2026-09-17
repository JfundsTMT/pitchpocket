import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';
import { addTombstone } from '@/lib/sync-tombstones';

const STORAGE_KEY = 'pitchpocket.debriefHistory.v1';

export type NodeOfferStatus = 'pending' | 'accepted' | 'declined';

export type NodeOffer = {
  label: string;
  status: NodeOfferStatus;
};

export type DebriefTurn = {
  transcript: string;
  echoResponse: string;
  // Set when Echo's reply for this turn offered to pin a discovery — see
  // CLAUDE.md ("Mind map"). Undefined means no offer was made this turn.
  nodeOffer?: NodeOffer;
};

// A compact, durable distillation of the whole conversation — regenerated
// after every turn (see summarizeDebrief in echo-api.ts) so it's always
// current even if the player never taps "Finish." This, not the raw
// transcripts, is what gets fed back to Echo as history: cheap enough to
// send a real season's worth instead of the last handful of raw messages.
export type DebriefSummary = {
  text: string;
  signals: string[];
};

export type DebriefRecord = {
  id: string;
  fixtureId?: string;
  turns: DebriefTurn[];
  createdAt: string;
  summary?: DebriefSummary;
};

function isNodeOffer(value: unknown): value is NodeOffer {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.label === 'string' &&
    (o.status === 'pending' || o.status === 'accepted' || o.status === 'declined')
  );
}

function isDebriefTurn(value: unknown): value is DebriefTurn {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  if (typeof t.transcript !== 'string' || typeof t.echoResponse !== 'string') return false;
  return t.nodeOffer === undefined || isNodeOffer(t.nodeOffer);
}

function isDebriefSummary(value: unknown): value is DebriefSummary {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.text === 'string' &&
    Array.isArray(s.signals) &&
    s.signals.every((sig) => typeof sig === 'string')
  );
}

export async function loadDebriefHistory(): Promise<DebriefRecord[]> {
  const parsed = await readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  // Drop malformed entries rather than letting one bad record break every
  // screen that maps over the list. A record needs at least one real turn.
  // summary is optional so older debriefs (saved before this field existed)
  // still load fine — they just fall back to raw transcript in
  // buildRecentDebriefContext below.
  return parsed.filter((r): r is DebriefRecord => {
    if (!r || typeof r !== 'object') return false;
    const record = r as Record<string, unknown>;
    return (
      typeof record.id === 'string' &&
      typeof record.createdAt === 'string' &&
      Array.isArray(record.turns) &&
      record.turns.length > 0 &&
      record.turns.every(isDebriefTurn) &&
      (record.summary === undefined || isDebriefSummary(record.summary))
    );
  });
}

// Creates a new record with its first turn — called when a debrief's first
// exchange completes.
export async function createDebriefRecord(input: {
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
  nodeOffer?: NodeOffer;
}): Promise<DebriefRecord> {
  const history = await loadDebriefHistory();
  const record: DebriefRecord = {
    id: generateId(),
    fixtureId: input.fixtureId,
    turns: [{ transcript: input.transcript, echoResponse: input.echoResponse, nodeOffer: input.nodeOffer }],
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

// Marks a specific turn's node offer as accepted/declined once the player
// has actually responded to it — the offer itself was already saved with
// the turn, this just records what happened to it.
export async function setNodeOfferStatus(
  recordId: string,
  turnIndex: number,
  status: 'accepted' | 'declined',
): Promise<DebriefRecord | null> {
  const history = await loadDebriefHistory();
  let updated: DebriefRecord | null = null;
  const next = history.map((record) => {
    if (record.id !== recordId) return record;
    const turn = record.turns[turnIndex];
    if (!turn || !turn.nodeOffer) return record;
    const turns = [...record.turns];
    turns[turnIndex] = { ...turn, nodeOffer: { ...turn.nodeOffer, status } };
    updated = { ...record, turns };
    return updated;
  });
  if (!updated) return null;
  await writeJson(STORAGE_KEY, next);
  requestPush();
  return updated;
}

// Overwrites the running summary for a record — called after every turn
// (not just on "Finish"), so an abandoned mid-conversation debrief still
// has a current summary rather than none at all.
export async function saveDebriefSummary(recordId: string, summary: DebriefSummary): Promise<DebriefRecord | null> {
  const history = await loadDebriefHistory();
  let updated: DebriefRecord | null = null;
  const next = history.map((record) => {
    if (record.id !== recordId) return record;
    updated = { ...record, summary };
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
  summary: string;
  signals: string[];
};

// Bounded context sent to Echo (and Flow Recipe) so the payload can't grow
// without limit — but summaries are compact (a couple hundred chars plus a
// handful of short tags each), so this can afford to cover a genuine
// season's worth of debriefs rather than the last 5 raw ones. That's what
// actually makes cross-debrief pattern detection real: Echo can see a
// signal like "hesitated before shooting" recurring across many matches,
// not just guess from a thin, truncated recent window.
const RECENT_DEBRIEF_LIMIT = 30;
const SUMMARY_CHAR_LIMIT = 300;
const SIGNALS_LIMIT = 6;

export function buildRecentDebriefContext(history: DebriefRecord[]): PastDebrief[] {
  return [...history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_DEBRIEF_LIMIT)
    .reverse()
    .map((record) => {
      if (record.summary) {
        return {
          date: record.createdAt,
          summary: truncate(record.summary.text),
          signals: record.summary.signals.slice(0, SIGNALS_LIMIT),
        };
      }
      // Fallback for debriefs saved before this feature existed, or where
      // summarization never completed — degrade to a raw-transcript
      // excerpt rather than dropping the debrief from history entirely.
      return {
        date: record.createdAt,
        summary: truncate(record.turns.map((t) => t.transcript).join(' … ')),
        signals: [],
      };
    });
}

function truncate(text: string): string {
  return text.length > SUMMARY_CHAR_LIMIT ? `${text.slice(0, SUMMARY_CHAR_LIMIT)}…` : text;
}
