import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'pitchpocket.syncTombstones.v1';

// Ids deleted locally but possibly not yet soft-deleted server-side. Kept
// until a sync round confirms the server knows, so an offline delete can't
// be resurrected by the next pull.
export type Tombstones = {
  fixtures: string[];
  debriefs: string[];
  mindMapNodes: string[];
};

const EMPTY: Tombstones = { fixtures: [], debriefs: [], mindMapNodes: [] };

export async function loadTombstones(): Promise<Tombstones> {
  const parsed = await readJson<unknown>(STORAGE_KEY, EMPTY);
  if (!parsed || typeof parsed !== 'object') return EMPTY;
  const t = parsed as Tombstones;
  return {
    fixtures: Array.isArray(t.fixtures) ? t.fixtures.filter((id) => typeof id === 'string') : [],
    debriefs: Array.isArray(t.debriefs) ? t.debriefs.filter((id) => typeof id === 'string') : [],
    mindMapNodes: Array.isArray(t.mindMapNodes) ? t.mindMapNodes.filter((id) => typeof id === 'string') : [],
  };
}

export async function addTombstone(kind: keyof Tombstones, id: string): Promise<void> {
  const current = await loadTombstones();
  if (!current[kind].includes(id)) {
    current[kind] = [...current[kind], id];
    await writeJson(STORAGE_KEY, current);
  }
}

export async function clearAllTombstones(): Promise<void> {
  await writeJson(STORAGE_KEY, EMPTY);
}

export async function clearTombstones(confirmed: Partial<Tombstones>): Promise<void> {
  const current = await loadTombstones();
  await writeJson(STORAGE_KEY, {
    fixtures: confirmed.fixtures ? current.fixtures.filter((id) => !confirmed.fixtures!.includes(id)) : current.fixtures,
    debriefs: confirmed.debriefs ? current.debriefs.filter((id) => !confirmed.debriefs!.includes(id)) : current.debriefs,
    mindMapNodes: confirmed.mindMapNodes
      ? current.mindMapNodes.filter((id) => !confirmed.mindMapNodes!.includes(id))
      : current.mindMapNodes,
  });
}
