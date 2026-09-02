import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearAllDebriefs } from '@/lib/debrief-history';
import { clearAllFixtures } from '@/lib/fixtures';
import { clearPlayerProfile, loadPlayerProfile, savePlayerProfile, type PlayerProfile } from '@/lib/player-profile';
import { supabase } from '@/lib/supabase';
import { clearAllTombstones } from '@/lib/sync-tombstones';

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
      // A true fresh save: wipes the whole local career and signs out of the
      // backend, so the next onboarding starts a brand-new (anonymous)
      // career. The old career stays safe in the cloud under its account and
      // comes back via restore.
      resetOnboarding: async () => {
        await Promise.all([clearPlayerProfile(), clearAllFixtures(), clearAllDebriefs(), clearAllTombstones()]);
        if (supabase) {
          await supabase.auth.signOut().catch(() => undefined);
        }
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
