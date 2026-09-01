import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ARCHETYPES } from '@/features/onboarding/archetypes';
import type { OnboardingAction, OnboardingState } from '@/features/onboarding/onboarding-reducer';

type ArchetypeStepProps = {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
};

export function ArchetypeStep({ state, dispatch }: ArchetypeStepProps) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ThemedText type="title" style={styles.title}>
        Pick what’s closest to your game.
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
        One more if a second one fits too.
      </ThemedText>

      {ARCHETYPES.map((archetype) => {
        const isPrimary = state.primaryArchetypeId === archetype.id;
        const isSecondary = state.secondaryArchetypeId === archetype.id;
        return (
          <Pressable
            key={archetype.id}
            onPress={() => dispatch({ type: 'SELECT_ARCHETYPE', archetypeId: archetype.id })}
            accessibilityRole="button"
            accessibilityLabel={`${archetype.name}. ${archetype.description}`}
            accessibilityState={{ selected: isPrimary || isSecondary }}>
            <ThemedView
              type={isPrimary || isSecondary ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.card}>
              <ThemedText type="smallBold">
                {archetype.name}
                {isPrimary ? ' · Primary' : isSecondary ? ' · Secondary' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardDescription}>
                {archetype.description}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  cardDescription: {
    lineHeight: 20,
  },
});
