import AsyncStorage from '@react-native-async-storage/async-storage';

// A single hardened read path for every AsyncStorage-backed model in the
// app. A player's fixtures and debrief history are the actual "career save"
// — if a write is ever interrupted and leaves corrupt JSON behind, the app
// should degrade to an empty/default value instead of crashing the screen.
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Corrupt data at "${key}", falling back to default`, error);
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
