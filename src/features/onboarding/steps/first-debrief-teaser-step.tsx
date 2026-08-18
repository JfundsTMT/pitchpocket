import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ARCHETYPES } from '@/features/onboarding/archetypes';
import { POSITION_GROUPS } from '@/features/onboarding/onboarding-options';
import type { OnboardingAction, OnboardingState } from '@/features/onboarding/onboarding-reducer';

type FirstDebriefTeaserStepProps = {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
};

export function FirstDebriefTeaserStep({ state, dispatch }: FirstDebriefTeaserStepProps) {
  if (state.hasRecentMatch === null) {
    return (
      <>
        <ThemedText type="title" style={styles.title}>
          Played recently?
        </ThemedText>
        <View style={styles.choices}>
          <Pressable onPress={() => dispatch({ type: 'SET_HAS_RECENT_MATCH', hasRecentMatch: true })}>
            <ThemedView type="backgroundElement" style={styles.choiceCard}>
              <ThemedText type="smallBold">Yeah, last few days</ThemedText>
            </ThemedView>
          </Pressable>
          <Pressable onPress={() => dispatch({ type: 'SET_HAS_RECENT_MATCH', hasRecentMatch: false })}>
            <ThemedView type="backgroundElement" style={styles.choiceCard}>
              <ThemedText type="smallBold">Not for a while</ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      </>
    );
  }

  if (!state.hasRecentMatch) {
    return (
      <>
        <ThemedText type="title" style={styles.title}>
          No worries.
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
          Your first debrief with Echo kicks in as soon as you’ve got a match to talk through.
        </ThemedText>
      </>
    );
  }

  const position = POSITION_GROUPS.find((group) => group.id === state.position);
  const archetype = ARCHETYPES.find((a) => a.id === state.primaryArchetypeId);

  const personLabel = position?.personLabel ?? 'player';
  const clause = archetype?.debriefClause ?? 'plays their own way';
  const article = startsWithVowelSound(personLabel) ? 'an' : 'a';

  return (
    <>
      <ThemedText type="title" style={styles.title}>
        You said you’re {article} {personLabel} who {clause} — talk me through your last match.
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
        That’s the first one, once your next match is done. Ready?
      </ThemedText>
    </>
  );
}

function startsWithVowelSound(word: string): boolean {
  return /^[aeiou]/i.test(word);
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.three,
    lineHeight: 40,
  },
  body: {
    lineHeight: 24,
  },
  choices: {
    gap: Spacing.two,
  },
  choiceCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
