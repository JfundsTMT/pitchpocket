import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AgeBracketId, FootId, PlayerLevelId, PositionGroupId } from '@/features/onboarding/onboarding-options';
import type { TraitId } from '@/features/onboarding/trait-options';
import { readJson } from '@/lib/storage';
import { requestPush } from '@/lib/sync-signal';

const STORAGE_KEY = 'pitchpocket.playerProfile.v1';

export type PlayerProfile = {
  schemaVersion: 1;
  position: PositionGroupId;
  level: PlayerLevelId;
  ageBracket: AgeBracketId;
  foot: FootId;
  biggestStrengthId: TraitId;
  greatestWeaknessId: TraitId;
  primaryArchetypeId: string;
  secondaryArchetypeId?: string;
  ambition: string;
  hasRecentMatchAtOnboarding: boolean;
  onboardingComplete: true;
  onboardingCompletedAt: string;
};

export async function loadPlayerProfile(): Promise<PlayerProfile | null> {
  return readJson<PlayerProfile | null>(STORAGE_KEY, null);
}

export async function savePlayerProfile(profile: PlayerProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  requestPush();
}

/** Sync-engine use only: write a restored profile without re-triggering a push. */
export async function restorePlayerProfile(profile: PlayerProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export async function clearPlayerProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
