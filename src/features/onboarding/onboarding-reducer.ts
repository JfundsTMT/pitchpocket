import type { AgeBracketId, FootId, PlayerLevelId, PositionGroupId } from '@/features/onboarding/onboarding-options';
import type { TraitId } from '@/features/onboarding/trait-options';

export const ONBOARDING_STEP_COUNT = 5;

export type OnboardingState = {
  step: number;
  position: PositionGroupId | null;
  level: PlayerLevelId | null;
  ageBracket: AgeBracketId | null;
  foot: FootId | null;
  biggestStrengthId: TraitId | null;
  greatestWeaknessId: TraitId | null;
  primaryArchetypeId: string | null;
  secondaryArchetypeId: string | null;
  ambition: string;
  hasRecentMatch: boolean | null;
};

export const initialOnboardingState: OnboardingState = {
  step: 0,
  position: null,
  level: null,
  ageBracket: null,
  foot: null,
  biggestStrengthId: null,
  greatestWeaknessId: null,
  primaryArchetypeId: null,
  secondaryArchetypeId: null,
  ambition: '',
  hasRecentMatch: null,
};

export type OnboardingAction =
  | { type: 'SET_POSITION'; position: PositionGroupId }
  | { type: 'SET_LEVEL'; level: PlayerLevelId }
  | { type: 'SET_AGE_BRACKET'; ageBracket: AgeBracketId }
  | { type: 'SET_FOOT'; foot: FootId }
  | { type: 'SET_BIGGEST_STRENGTH'; traitId: TraitId }
  | { type: 'SET_GREATEST_WEAKNESS'; traitId: TraitId }
  | { type: 'SELECT_ARCHETYPE'; archetypeId: string }
  | { type: 'SET_AMBITION'; ambition: string }
  | { type: 'SET_HAS_RECENT_MATCH'; hasRecentMatch: boolean }
  | { type: 'GO_NEXT' }
  | { type: 'GO_BACK' };

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_POSITION':
      return { ...state, position: action.position };
    case 'SET_LEVEL':
      return { ...state, level: action.level };
    case 'SET_AGE_BRACKET':
      return { ...state, ageBracket: action.ageBracket };
    case 'SET_FOOT':
      return { ...state, foot: action.foot };
    case 'SET_BIGGEST_STRENGTH':
      return {
        ...state,
        biggestStrengthId: action.traitId,
        // A trait can't be both your strength and your weakness at once.
        greatestWeaknessId: state.greatestWeaknessId === action.traitId ? null : state.greatestWeaknessId,
      };
    case 'SET_GREATEST_WEAKNESS':
      return {
        ...state,
        greatestWeaknessId: action.traitId,
        biggestStrengthId: state.biggestStrengthId === action.traitId ? null : state.biggestStrengthId,
      };
    case 'SELECT_ARCHETYPE':
      return { ...state, ...selectArchetype(state, action.archetypeId) };
    case 'SET_AMBITION':
      return { ...state, ambition: action.ambition };
    case 'SET_HAS_RECENT_MATCH':
      return { ...state, hasRecentMatch: action.hasRecentMatch };
    case 'GO_NEXT':
      return { ...state, step: Math.min(state.step + 1, ONBOARDING_STEP_COUNT - 1) };
    case 'GO_BACK':
      return { ...state, step: Math.max(state.step - 1, 0) };
    default:
      return state;
  }
}

function selectArchetype(
  state: OnboardingState,
  archetypeId: string,
): Pick<OnboardingState, 'primaryArchetypeId' | 'secondaryArchetypeId'> {
  const { primaryArchetypeId, secondaryArchetypeId } = state;

  if (archetypeId === primaryArchetypeId) {
    // Deselecting primary promotes secondary (if any) into its place.
    return { primaryArchetypeId: secondaryArchetypeId, secondaryArchetypeId: null };
  }
  if (archetypeId === secondaryArchetypeId) {
    return { primaryArchetypeId, secondaryArchetypeId: null };
  }
  if (primaryArchetypeId === null) {
    return { primaryArchetypeId: archetypeId, secondaryArchetypeId };
  }
  // Primary already set: this pick becomes (or replaces) secondary.
  return { primaryArchetypeId, secondaryArchetypeId: archetypeId };
}

export function isSeedsStepComplete(state: OnboardingState): boolean {
  return (
    state.position !== null &&
    state.level !== null &&
    state.ageBracket !== null &&
    state.foot !== null &&
    state.biggestStrengthId !== null &&
    state.greatestWeaknessId !== null
  );
}

export function isArchetypeStepComplete(state: OnboardingState): boolean {
  return state.primaryArchetypeId !== null;
}

export function isAmbitionStepComplete(state: OnboardingState): boolean {
  return state.ambition.trim().length > 0;
}

export function isFirstDebriefTeaserStepComplete(state: OnboardingState): boolean {
  return state.hasRecentMatch !== null;
}
