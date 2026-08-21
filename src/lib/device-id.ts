import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pitchpocket.deviceId.v1';

/**
 * A random, anonymous per-install identifier — not tied to any account.
 * Sent as a header on backend calls purely to discourage casual abuse of an
 * otherwise-open endpoint; it is not real authentication.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = generateId();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}

function generateId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
