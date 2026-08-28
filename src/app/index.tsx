import { Link, Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import { useTheme } from '@/hooks/use-theme';
import { loadDebriefHistory, type DebriefRecord } from '@/lib/debrief-history';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
import { loadPlayerProfile, type PlayerProfile } from '@/lib/player-profile';

export default function HomeScreen() {
  const { status, resetOnboarding } = useOnboardingGate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (status !== 'complete') return;
    Promise.all([loadPlayerProfile(), loadFixtures(), loadDebriefHistory()]).then(
      ([loadedProfile, loadedFixtures, loadedHistory]) => {
        setProfile(loadedProfile);
        setFixtures(loadedFixtures);
        setHistory(loadedHistory);
        setDataLoaded(true);
      },
    );
  }, [status]);

  if (status === 'loading') {
    return null;
  }

  if (status === 'needed') {
    return <Redirect href="/onboarding" />;
  }

  if (!dataLoaded || !profile) {
    return null;
  }

  const identity = resolvePlayerContext(profile);
  const { upcomingFixture, fixtureNeedingDebrief } = deriveFixtureState(fixtures, history);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="title" style={styles.title}>
            PitchPocket
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardLabel}>
              IDENTITY
            </ThemedText>
            <ThemedText type="default">
              {capitalize(identity.positionLabel)} · {identity.level} · {identity.archetypeName}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardLabel}>
              NEXT
            </ThemedText>
            {fixtureNeedingDebrief ? (
              <>
                <ThemedText type="default" style={styles.cardBody}>
                  vs {fixtureNeedingDebrief.opponent} — {formatFixtureDate(fixtureNeedingDebrief.date)}
                </ThemedText>
                <Pressable
                  onPress={() => router.push({ pathname: '/debrief', params: { fixtureId: fixtureNeedingDebrief.id } })}>
                  <PrimaryButtonInner label="Debrief with Echo" />
                </Pressable>
              </>
            ) : upcomingFixture ? (
              <ThemedText type="default" style={styles.cardBody}>
                vs {upcomingFixture.opponent} — {formatFixtureDate(upcomingFixture.date)}
              </ThemedText>
            ) : (
              <>
                <ThemedText type="default" themeColor="textSecondary" style={styles.cardBody}>
                  No fixture set yet.
                </ThemedText>
                <Link href="/add-fixture" asChild>
                  <Pressable>
                    <PrimaryButtonInner label="Add your next fixture" />
                  </Pressable>
                </Link>
              </>
            )}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardLabel}>
              RECENT ACTIVITY
            </ThemedText>
            {history.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No debriefs yet.
              </ThemedText>
            ) : (
              [...history]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 5)
                .map((record) => (
                  <ThemedView key={record.id} style={styles.historyRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatFixtureDate(record.createdAt)}
                    </ThemedText>
                    <ThemedText type="small" numberOfLines={2}>
                      {record.echoResponse}
                    </ThemedText>
                  </ThemedView>
                ))
            )}
          </ThemedView>

          {__DEV__ ? (
            <Pressable onPress={resetOnboarding} style={styles.devResetButton}>
              <ThemedText type="small" themeColor="textSecondary">
                Reset onboarding (dev)
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function deriveFixtureState(fixtures: Fixture[], history: DebriefRecord[]) {
  const now = Date.now();
  const debriefedFixtureIds = new Set(history.map((r) => r.fixtureId).filter(Boolean));

  const past = fixtures
    .filter((f) => new Date(f.date).getTime() < now)
    .sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = fixtures
    .filter((f) => new Date(f.date).getTime() >= now)
    .sort((a, b) => a.date.localeCompare(b.date));

  const fixtureNeedingDebrief = past.find((f) => !debriefedFixtureIds.has(f.id));

  return {
    upcomingFixture: upcoming[0],
    fixtureNeedingDebrief,
  };
}

function PrimaryButtonInner({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.primaryButton, { backgroundColor: theme.text }]}>
      <ThemedText type="smallBold" themeColor="background">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatFixtureDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  title: {
    marginBottom: Spacing.one,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  cardLabel: {
    letterSpacing: 0.5,
  },
  cardBody: {
    marginBottom: Spacing.one,
  },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  historyRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.one,
  },
  devResetButton: {
    alignItems: 'center',
    padding: Spacing.two,
  },
});
