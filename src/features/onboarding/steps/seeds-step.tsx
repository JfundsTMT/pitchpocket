import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { OnboardingChip } from '@/features/onboarding/onboarding-chip';
import { AGE_BRACKETS, FEET, PLAYER_LEVELS, POSITION_GROUPS } from '@/features/onboarding/onboarding-options';
import type { OnboardingAction, OnboardingState } from '@/features/onboarding/onboarding-reducer';
import { TRAITS } from '@/features/onboarding/trait-options';

type SeedsStepProps = {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
};

export function SeedsStep({ state, dispatch }: SeedsStepProps) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ThemedText type="title" style={styles.title}>
        Quick basics before we start.
      </ThemedText>

      <ChipGroup
        label="Position"
        options={POSITION_GROUPS}
        selectedId={state.position}
        onSelect={(id) => dispatch({ type: 'SET_POSITION', position: id })}
      />
      <ChipGroup
        label="Level"
        options={PLAYER_LEVELS}
        selectedId={state.level}
        onSelect={(id) => dispatch({ type: 'SET_LEVEL', level: id })}
      />
      <ChipGroup
        label="Age bracket"
        options={AGE_BRACKETS}
        selectedId={state.ageBracket}
        onSelect={(id) => dispatch({ type: 'SET_AGE_BRACKET', ageBracket: id })}
      />
      <ChipGroup
        label="Foot"
        options={FEET}
        selectedId={state.foot}
        onSelect={(id) => dispatch({ type: 'SET_FOOT', foot: id })}
      />
      <ChipGroup
        label="Biggest strength"
        options={TRAITS}
        selectedId={state.biggestStrengthId}
        onSelect={(id) => dispatch({ type: 'SET_BIGGEST_STRENGTH', traitId: id })}
      />
      <ChipGroup
        label="Greatest weakness"
        options={TRAITS}
        selectedId={state.greatestWeaknessId}
        onSelect={(id) => dispatch({ type: 'SET_GREATEST_WEAKNESS', traitId: id })}
      />
    </ScrollView>
  );
}

type ChipGroupProps<T extends string> = {
  label: string;
  options: { id: T; label: string }[];
  selectedId: T | null;
  onSelect: (id: T) => void;
};

function ChipGroup<T extends string>({ label, options, selectedId, onSelect }: ChipGroupProps<T>) {
  return (
    <View style={styles.group}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupLabel}>
        {label.toUpperCase()}
      </ThemedText>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <OnboardingChip
            key={option.id}
            label={option.label}
            selected={selectedId === option.id}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  title: {
    marginBottom: Spacing.two,
  },
  group: {
    gap: Spacing.two,
  },
  groupLabel: {
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
