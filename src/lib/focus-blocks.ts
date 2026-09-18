import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';

const STORAGE_KEY = 'pitchpocket.focusBlocks.v1';

export type FocusBlockStatus = 'active' | 'eased' | 'dropped';

export type FocusBlock = {
  id: string;
  nodeId: string;
  label: string;
  plan: string[];
  status: FocusBlockStatus;
  createdAt: string;
};

function isFocusBlock(value: unknown): value is FocusBlock {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.nodeId === 'string' &&
    typeof b.label === 'string' &&
    Array.isArray(b.plan) &&
    b.plan.every((p) => typeof p === 'string') &&
    (b.status === 'active' || b.status === 'eased' || b.status === 'dropped') &&
    typeof b.createdAt === 'string'
  );
}

export async function loadFocusBlocks(): Promise<FocusBlock[]> {
  const parsed = await readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isFocusBlock);
}

// A focus block is a second, separate commitment beyond pinning a node —
// pinning just means "this is real," starting a focus block means "I'm
// actively going to work on this." Never created automatically.
export async function createFocusBlock(input: { nodeId: string; label: string; plan: string[] }): Promise<FocusBlock> {
  const blocks = await loadFocusBlocks();
  const block: FocusBlock = {
    id: generateId(),
    nodeId: input.nodeId,
    label: input.label,
    plan: input.plan,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, [...blocks, block]);
  requestPush();
  return block;
}

// Player-driven only, no automatic evaluation — attribute movement is a
// later concern, not wired to focus blocks yet.
export async function setFocusBlockStatus(id: string, status: FocusBlockStatus): Promise<FocusBlock | null> {
  const blocks = await loadFocusBlocks();
  let updated: FocusBlock | null = null;
  const next = blocks.map((block) => {
    if (block.id !== id) return block;
    updated = { ...block, status };
    return updated;
  });
  if (!updated) return null;
  await writeJson(STORAGE_KEY, next);
  requestPush();
  return updated;
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replaceAllFocusBlocks(blocks: FocusBlock[]): Promise<void> {
  await writeJson(STORAGE_KEY, blocks);
}

/** Fresh-save / account-switch use: wipe locally without tombstoning (the cloud copy survives). */
export async function clearAllFocusBlocks(): Promise<void> {
  await writeJson(STORAGE_KEY, []);
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
