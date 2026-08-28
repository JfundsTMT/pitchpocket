import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pitchpocket.fixtures.v1';

export type Fixture = {
  id: string;
  opponent: string;
  date: string; // ISO string
  competition?: string;
  createdAt: string;
};

export async function loadFixtures(): Promise<Fixture[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Fixture[];
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
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...fixtures, fixture]));
  return fixture;
}

export async function deleteFixture(id: string): Promise<void> {
  const fixtures = await loadFixtures();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fixtures.filter((f) => f.id !== id)));
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
