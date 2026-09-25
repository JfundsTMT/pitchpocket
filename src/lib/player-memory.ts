import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';

const STORAGE_KEY = 'pitchpocket.playerMemory.v1';

// A compact, evolving memory of the player — the way a person who knows
// someone well remembers them (a handful of durable facts), not a replay of
// every past conversation. Regenerated wholesale by /api/update-memory at
// the close of each debrief, from the current memory plus recent debrief
// history. Document semantics like FlowRecipe (whole-set saves,
// last-write-wins by updatedAt) rather than an append-only record
// collection — there's nothing to merge, the server derives the complete
// current set each time.
export type MemoryFact = {
  id: string;
  text: string;
};

export type PlayerMemory = {
  facts: MemoryFact[];
  updatedAt: string;
};

const UNSET_TIMESTAMP = new Date(0).toISOString();
const EMPTY: PlayerMemory = { facts: [], updatedAt: UNSET_TIMESTAMP };

// True for memory that's never actually been saved (device default) — same
// role as isUnsetFlowRecipe: lets the sync engine avoid pushing "nothing"
// over a real remote copy before the first pull.
export function isUnsetPlayerMemory(memory: PlayerMemory): boolean {
  return memory.updatedAt === UNSET_TIMESTAMP;
}

function isMemoryFact(value: unknown): value is MemoryFact {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return typeof f.id === 'string' && typeof f.text === 'string';
}

export async function loadPlayerMemory(): Promise<PlayerMemory> {
  const parsed = await readJson<unknown>(STORAGE_KEY, EMPTY);
  if (!parsed || typeof parsed !== 'object') return EMPTY;
  const m = parsed as Record<string, unknown>;
  if (!Array.isArray(m.facts) || typeof m.updatedAt !== 'string') return EMPTY;
  return { facts: m.facts.filter(isMemoryFact), updatedAt: m.updatedAt };
}

// The server returns the complete current set of facts (plain strings); we
// assign ids on the way in since the server doesn't track them.
export async function savePlayerMemory(factTexts: string[]): Promise<PlayerMemory> {
  const memory: PlayerMemory = {
    facts: factTexts.map((text) => ({ id: generateId(), text })),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, memory);
  requestPush();
  return memory;
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replacePlayerMemory(memory: PlayerMemory): Promise<void> {
  await writeJson(STORAGE_KEY, memory);
}

/** Fresh-save / account-switch use: wipe locally (the cloud copy survives). */
export async function clearPlayerMemory(): Promise<void> {
  await writeJson(STORAGE_KEY, EMPTY);
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
