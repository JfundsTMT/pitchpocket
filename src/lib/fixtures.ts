import { readJson, writeJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';
import { addTombstone } from '@/lib/sync-tombstones';

const STORAGE_KEY = 'pitchpocket.fixtures.v1';

export type Fixture = {
  id: string;
  opponent: string;
  date: string; // ISO string
  competition?: string;
  createdAt: string;
};

export async function loadFixtures(): Promise<Fixture[]> {
  const parsed = await readJson<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  // Drop malformed entries rather than letting one bad record break every
  // screen that maps over the list.
  return parsed.filter(
    (f): f is Fixture =>
      !!f &&
      typeof (f as Fixture).id === 'string' &&
      typeof (f as Fixture).opponent === 'string' &&
      typeof (f as Fixture).date === 'string',
  );
}

export async function addFixture(input: { opponent: string; date: string; competition?: string }): Promise<Fixture> {
  const fixtures = await loadFixtures();
  const fixture: Fixture = {
    id: generateId(),
    opponent: input.opponent,
    date: input.date,
    competition: input.competition,
    createdAt: new Date().toISOString(),
  };
  await writeJson(STORAGE_KEY, [...fixtures, fixture]);
  requestPush();
  return fixture;
}

export async function deleteFixture(id: string): Promise<void> {
  const fixtures = await loadFixtures();
  await writeJson(STORAGE_KEY, fixtures.filter((f) => f.id !== id));
  await addTombstone('fixtures', id);
  requestPush();
}

/** Sync-engine use only: overwrite local state without re-triggering a push. */
export async function replaceAllFixtures(fixtures: Fixture[]): Promise<void> {
  await writeJson(STORAGE_KEY, fixtures);
}

/** Fresh-save / account-switch use: wipe locally without tombstoning (the cloud copy survives). */
export async function clearAllFixtures(): Promise<void> {
  await writeJson(STORAGE_KEY, []);
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
