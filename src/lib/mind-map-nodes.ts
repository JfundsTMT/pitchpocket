import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';
import { addTombstone } from '@/lib/sync-tombstones';

const STORAGE_KEY = 'pitchpocket.mindMapNodes.v1';

export type MindMapNode = {
  id: string;
  label: string;
  debriefId?: string;
  createdAt: string;
};

export async function loadMindMapNodes(): Promise<MindMapNode[]> {
  const parsed = await readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (n): n is MindMapNode =>
      !!n &&
      typeof n === 'object' &&
      typeof (n as MindMapNode).id === 'string' &&
      typeof (n as MindMapNode).label === 'string' &&
      typeof (n as MindMapNode).createdAt === 'string',
  );
}

// A node is only ever created from a player accepting an offer — see
// debrief-history.ts's NodeOffer. Nothing else writes to this store.
export async function createMindMapNode(input: { label: string; debriefId?: string }): Promise<MindMapNode> {
  const nodes = await loadMindMapNodes();
  const node: MindMapNode = {
    id: generateId(),
    label: input.label,
    debriefId: input.debriefId,
    createdAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, [...nodes, node]);
  requestPush();
  return node;
}

export async function deleteMindMapNode(id: string): Promise<void> {
  const nodes = await loadMindMapNodes();
  await writeJson(STORAGE_KEY, nodes.filter((n) => n.id !== id));
  await addTombstone('mindMapNodes', id);
  requestPush();
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replaceAllMindMapNodes(nodes: MindMapNode[]): Promise<void> {
  await writeJson(STORAGE_KEY, nodes);
}

/** Fresh-save / account-switch use: wipe locally without tombstoning (the cloud copy survives). */
export async function clearAllMindMapNodes(): Promise<void> {
  await writeJson(STORAGE_KEY, []);
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
