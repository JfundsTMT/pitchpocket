import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AgeBracketId, FootId, PlayerLevelId, PositionGroupId } from '@/features/onboarding/onboarding-options';
import type { TraitId } from '@/features/onboarding/trait-options';

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
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as PlayerProfile;
}

export async function savePlayerProfile(profile: PlayerProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export async function clearPlayerProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
