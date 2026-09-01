import { readJson, writeJson } from '@/lib/storage';

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
  return fixture;
}

export async function deleteFixture(id: string): Promise<void> {
  const fixtures = await loadFixtures();
  await writeJson(STORAGE_KEY, fixtures.filter((f) => f.id !== id));
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
