import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearPlayerProfile, loadPlayerProfile, savePlayerProfile, type PlayerProfile } from '@/lib/player-profile';

type GateStatus = 'loading' | 'needed' | 'complete';

type OnboardingGateContextValue = {
  status: GateStatus;
  completeOnboarding: (profile: PlayerProfile) => Promise<void>;
  /** Dev/QA only — clears the saved profile and flips status back to 'needed' in memory, no reload required. */
  resetOnboarding: () => Promise<void>;
};

const OnboardingGateContext = createContext<OnboardingGateContextValue | null>(null);

export function OnboardingGateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    loadPlayerProfile().then((profile) => {
      if (cancelled) return;
      setStatus(profile ? 'complete' : 'needed');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<OnboardingGateContextValue>(
    () => ({
      status,
      completeOnboarding: async (profile: PlayerProfile) => {
        await savePlayerProfile(profile);
        setStatus('complete');
      },
      resetOnboarding: async () => {
        await clearPlayerProfile();
        setStatus('needed');
      },
    }),
    [status],
  );

  return <OnboardingGateContext.Provider value={value}>{children}</OnboardingGateContext.Provider>;
}

export function useOnboardingGate(): OnboardingGateContextValue {
  const context = useContext(OnboardingGateContext);
  if (!context) {
    throw new Error('useOnboardingGate must be used within an OnboardingGateProvider');
  }
  return context;
}
