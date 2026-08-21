import { Link, Redirect } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';

export default function HomeScreen() {
  const { status, resetOnboarding } = useOnboardingGate();

  if (status === 'loading') {
    return null;
  }

  if (status === 'needed') {
    return <Redirect href="/onboarding" />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">PitchPocket</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Stage 2: onboarding complete. Home screen lands in stage 4.
        </ThemedText>
        {__DEV__ ? (
          <>
            <Pressable onPress={resetOnboarding} style={styles.devResetButton}>
              <ThemedText type="small" themeColor="textSecondary">
                Reset onboarding (dev)
              </ThemedText>
            </Pressable>
            <Link href="/debrief-test" style={styles.devResetButton}>
              <ThemedText type="small" themeColor="textSecondary">
                Debrief test (dev)
              </ThemedText>
            </Link>
          </>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  devResetButton: {
    marginTop: Spacing.four,
    padding: Spacing.two,
  },
});
