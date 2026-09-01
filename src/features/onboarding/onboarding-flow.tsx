import { router } from 'expo-router';
import { useCallback, useEffect, useReducer } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import {
  ONBOARDING_STEP_COUNT,
  initialOnboardingState,
  isAmbitionStepComplete,
  isArchetypeStepComplete,
  isFirstDebriefTeaserStepComplete,
  isSeedsStepComplete,
  onboardingReducer,
  type OnboardingAction,
  type OnboardingState,
} from '@/features/onboarding/onboarding-reducer';
import { AmbitionStep } from '@/features/onboarding/steps/ambition-step';
import { ArchetypeStep } from '@/features/onboarding/steps/archetype-step';
import { EchoIntroStep } from '@/features/onboarding/steps/echo-intro-step';
import { FirstDebriefTeaserStep } from '@/features/onboarding/steps/first-debrief-teaser-step';
import { SeedsStep } from '@/features/onboarding/steps/seeds-step';
import { useTheme } from '@/hooks/use-theme';
import type { PlayerProfile } from '@/lib/player-profile';

export function OnboardingFlow() {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState);
  const { completeOnboarding } = useOnboardingGate();
  const theme = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 200 });
  }, [state.step, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const handleComplete = useCallback(async () => {
    const profile: PlayerProfile = {
      schemaVersion: 1,
      position: state.position!,
      level: state.level!,
      ageBracket: state.ageBracket!,
      foot: state.foot!,
      biggestStrengthId: state.biggestStrengthId!,
      greatestWeaknessId: state.greatestWeaknessId!,
      primaryArchetypeId: state.primaryArchetypeId!,
      secondaryArchetypeId: state.secondaryArchetypeId ?? undefined,
      ambition: state.ambition,
      hasRecentMatchAtOnboarding: state.hasRecentMatch!,
      onboardingComplete: true,
      onboardingCompletedAt: new Date().toISOString(),
    };
    await completeOnboarding(profile);
    router.replace('/');
  }, [state, completeOnboarding]);

  const handleContinue = useCallback(() => {
    if (state.step === ONBOARDING_STEP_COUNT - 1) {
      handleComplete();
    } else {
      dispatch({ type: 'GO_NEXT' });
    }
  }, [state.step, handleComplete]);

  const handleBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dispatch({ type: 'GO_BACK' });
      return true;
    });
    return () => subscription.remove();
  }, []);

  const canContinue = getCanContinue(state);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {state.step > 0 ? (
            <Pressable onPress={handleBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
              <ThemedText type="default">‹ Back</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          <View style={styles.dots}>
            {Array.from({ length: ONBOARDING_STEP_COUNT }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  { backgroundColor: index <= state.step ? theme.text : theme.backgroundElement },
                ]}
              />
            ))}
          </View>
        </View>

        <Animated.View style={[styles.stepContainer, fadeStyle]}>
          {renderStep(state, dispatch)}
        </Animated.View>

        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          style={[
            styles.continueButton,
            { backgroundColor: theme.text, opacity: canContinue ? 1 : 0.3 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={state.step === 0 ? "Let's go." : 'Continue'}
          accessibilityState={{ disabled: !canContinue }}>
          <ThemedText type="smallBold" themeColor="background">
            {state.step === 0 ? "Let's go." : 'Continue'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function renderStep(state: OnboardingState, dispatch: (action: OnboardingAction) => void) {
  switch (state.step) {
    case 0:
      return <EchoIntroStep />;
    case 1:
      return <SeedsStep state={state} dispatch={dispatch} />;
    case 2:
      return <ArchetypeStep state={state} dispatch={dispatch} />;
    case 3:
      return <AmbitionStep state={state} dispatch={dispatch} />;
    case 4:
      return <FirstDebriefTeaserStep state={state} dispatch={dispatch} />;
    default:
      return null;
  }
}

function getCanContinue(state: OnboardingState): boolean {
  switch (state.step) {
    case 0:
      return true;
    case 1:
      return isSeedsStepComplete(state);
    case 2:
      return isArchetypeStepComplete(state);
    case 3:
      return isAmbitionStepComplete(state);
    case 4:
      return isFirstDebriefTeaserStepComplete(state);
    default:
      return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    marginBottom: Spacing.four,
  },
  backSpacer: {
    width: 48,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepContainer: {
    flex: 1,
  },
  continueButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
});
