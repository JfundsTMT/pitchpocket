import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pitchpocket.debriefHistory.v1';

export type DebriefRecord = {
  id: string;
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
  createdAt: string;
};

export async function loadDebriefHistory(): Promise<DebriefRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as DebriefRecord[];
}

export async function addDebriefRecord(input: {
  fixtureId?: string;
  transcript: string;
  echoResponse: string;
}): Promise<DebriefRecord> {
  const history = await loadDebriefHistory();
  const record: DebriefRecord = {
    id: generateId(),
    fixtureId: input.fixtureId,
    transcript: input.transcript,
    echoResponse: input.echoResponse,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...history, record]));
  return record;
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
