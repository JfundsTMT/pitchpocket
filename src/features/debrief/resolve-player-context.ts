import { ARCHETYPES } from '@/features/onboarding/archetypes';
import { PLAYER_LEVELS, POSITION_GROUPS } from '@/features/onboarding/onboarding-options';
import { TRAITS } from '@/features/onboarding/trait-options';
import type { PlayerContext } from '@/lib/echo-api';
import type { PlayerProfile } from '@/lib/player-profile';

export function resolvePlayerContext(profile: PlayerProfile): PlayerContext {
  const position = POSITION_GROUPS.find((p) => p.id === profile.position);
  const level = PLAYER_LEVELS.find((l) => l.id === profile.level);
  const archetype = ARCHETYPES.find((a) => a.id === profile.primaryArchetypeId);
  const strength = TRAITS.find((t) => t.id === profile.biggestStrengthId);
  const weakness = TRAITS.find((t) => t.id === profile.greatestWeaknessId);

  return {
    positionLabel: position?.personLabel ?? 'player',
    level: level?.label ?? profile.level,
    archetypeName: archetype?.name ?? 'their own player',
    archetypeDescription: archetype?.description ?? 'Plays their own way.',
    biggestStrength: strength?.label ?? profile.biggestStrengthId,
    greatestWeakness: weakness?.label ?? profile.greatestWeaknessId,
    ambition: profile.ambition,
  };
}
