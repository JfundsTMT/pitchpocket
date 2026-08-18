import { KeyboardAvoidingView, Platform, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { OnboardingChip } from '@/features/onboarding/onboarding-chip';
import type { OnboardingAction, OnboardingState } from '@/features/onboarding/onboarding-reducer';
import { useTheme } from '@/hooks/use-theme';

const NOT_SURE_YET = 'Not sure yet';

type AmbitionStepProps = {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
};

export function AmbitionStep({ state, dispatch }: AmbitionStepProps) {
  const theme = useTheme();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Where are you trying to get to?
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
        No wrong answer — just what’s actually in your head.
      </ThemedText>

      <TextInput
        value={state.ambition}
        onChangeText={(text) => dispatch({ type: 'SET_AMBITION', ambition: text })}
        multiline
        placeholder="Type here..."
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      <OnboardingChip
        label={NOT_SURE_YET}
        selected={state.ambition === NOT_SURE_YET}
        onPress={() => dispatch({ type: 'SET_AMBITION', ambition: NOT_SURE_YET })}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    marginBottom: Spacing.one,
  },
  subtitle: {
    marginBottom: Spacing.three,
  },
  input: {
    minHeight: 120,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
    marginBottom: Spacing.three,
  },
});
