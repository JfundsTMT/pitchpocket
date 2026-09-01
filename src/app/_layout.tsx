import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { OnboardingGateProvider, useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import { initSync } from '@/lib/sync';

SplashScreen.preventAutoHideAsync();
initSync();

function SplashGate() {
  const { status } = useOnboardingGate();

  useEffect(() => {
    if (status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <OnboardingGateProvider>
          <SplashGate />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </OnboardingGateProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
