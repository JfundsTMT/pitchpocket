import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';

const STORAGE_KEY = 'pitchpocket.flowRecipe.v1';

// The Flow Recipe is one small, curated, PLAYER-OWNED document — unlike
// fixtures/debriefs (append-only records), every part of it is editable, so
// it gets document semantics: whole-list saves, last-write-wins by
// updatedAt. The AI can draft items (see server/api/flow-recipe.ts), but
// drafts only become recipe through the same save path the player's own
// edits use — editability is the honesty control.
export type FlowItem = {
  id: string;
  label: string;
  // One line of where this came from: a debrief paraphrase for AI-drafted
  // items, empty for items the player typed themselves.
  evidence: string;
};

export type FlowRecipe = {
  items: FlowItem[];
  updatedAt: string;
};

const UNSET_TIMESTAMP = new Date(0).toISOString();
const EMPTY: FlowRecipe = { items: [], updatedAt: UNSET_TIMESTAMP };

// True for a recipe that's never actually been saved (device default) — the
// sync engine uses this to avoid pushing "nothing" over a real remote copy
// on first launch, before the first pull has happened.
export function isUnsetFlowRecipe(recipe: FlowRecipe): boolean {
  return recipe.updatedAt === UNSET_TIMESTAMP;
}

function isFlowItem(value: unknown): value is FlowItem {
  if (!value || typeof value !== 'object') return false;
  const i = value as Record<string, unknown>;
  return typeof i.id === 'string' && typeof i.label === 'string' && typeof i.evidence === 'string';
}

export async function loadFlowRecipe(): Promise<FlowRecipe> {
  const parsed = await readJson<unknown>(STORAGE_KEY, EMPTY);
  if (!parsed || typeof parsed !== 'object') return EMPTY;
  const r = parsed as Record<string, unknown>;
  if (!Array.isArray(r.items) || typeof r.updatedAt !== 'string') return EMPTY;
  return { items: r.items.filter(isFlowItem), updatedAt: r.updatedAt };
}

export async function saveFlowRecipe(items: FlowItem[]): Promise<FlowRecipe> {
  const recipe: FlowRecipe = { items, updatedAt: new Date().toISOString() };
  await writeJson(STORAGE_KEY, recipe);
  requestPush();
  return recipe;
}

export function newFlowItem(label: string, evidence = ''): FlowItem {
  return { id: generateId(), label, evidence };
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replaceFlowRecipe(recipe: FlowRecipe): Promise<void> {
  await writeJson(STORAGE_KEY, recipe);
}

/** Fresh-save / account-switch use: wipe locally (the cloud copy survives). */
export async function clearFlowRecipe(): Promise<void> {
  await writeJson(STORAGE_KEY, EMPTY);
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
