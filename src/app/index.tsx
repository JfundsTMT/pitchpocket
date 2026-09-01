import { useFocusEffect } from '@react-navigation/native';
import { Link, Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import { loadDebriefHistory, type DebriefRecord } from '@/lib/debrief-history';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
import { loadPlayerProfile, type PlayerProfile } from '@/lib/player-profile';

export default function HomeScreen() {
  const { status, resetOnboarding } = useOnboardingGate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (status !== 'complete') return;
      Promise.all([loadPlayerProfile(), loadFixtures(), loadDebriefHistory()]).then(
        ([loadedProfile, loadedFixtures, loadedHistory]) => {
          setProfile(loadedProfile);
          setFixtures(loadedFixtures);
          setHistory(loadedHistory);
          setDataLoaded(true);
        },
      );
    }, [status]),
  );

  if (status === 'loading') {
    return null;
  }

  if (status === 'needed') {
    return <Redirect href="/onboarding" />;
  }

  if (!dataLoaded || !profile) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={CareerTheme.accent} />
      </View>
    );
  }

  const identity = resolvePlayerContext(profile);
  const { upcomingFixture, fixtureNeedingDebrief } = deriveFixtureState(fixtures, history);
  const nextFixture = fixtureNeedingDebrief ?? upcomingFixture;
  const upcomingCount = fixtures.filter((f) => new Date(f.date).getTime() >= Date.now()).length;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.wordmark}>PITCHPOCKET</Text>

          <View style={styles.identityBanner}>
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>{identity.level.toUpperCase()}</Text>
            </View>
            <Text style={styles.archetypeName}>{identity.archetypeName}</Text>
            <Text style={styles.identitySub}>{capitalize(identity.positionLabel)}</Text>
          </View>

          <Text style={styles.sectionLabel}>NEXT MATCH</Text>
          <View style={styles.nextCard}>
            <View style={styles.dateBlock}>
              {nextFixture ? (
                <>
                  <Text style={styles.dateDay}>{formatDay(nextFixture.date)}</Text>
                  <Text style={styles.dateMonth}>{formatMonth(nextFixture.date)}</Text>
                </>
              ) : (
                <Text style={styles.dateDay}>—</Text>
              )}
            </View>
            <View style={styles.nextCardBody}>
              {nextFixture ? (
                <>
                  <Text style={styles.nextOpponent}>vs {nextFixture.opponent}</Text>
                  {nextFixture.competition ? (
                    <Text style={styles.nextMeta}>{nextFixture.competition}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.nextMeta}>No fixture set yet.</Text>
              )}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/debrief',
                    params: fixtureNeedingDebrief ? { fixtureId: fixtureNeedingDebrief.id } : {},
                  })
                }
                style={styles.primaryButton}
                accessibilityRole="button"
                accessibilityLabel="Debrief with Echo">
                <Text style={styles.primaryButtonText}>Debrief with Echo</Text>
              </Pressable>
              {!nextFixture ? (
                <Link href="/add-fixture" asChild>
                  <Pressable style={styles.secondaryButton} accessibilityRole="button" accessibilityLabel="Add a fixture">
                    <Text style={styles.secondaryButtonText}>Add a fixture</Text>
                  </Pressable>
                </Link>
              ) : null}
            </View>
          </View>

          <View style={styles.tileRow}>
            <Link href="/fixtures" asChild>
              <Pressable
                style={styles.tile}
                accessibilityRole="button"
                accessibilityLabel={`${upcomingCount} upcoming fixtures — view all fixtures`}>
                <Text style={styles.tileNumber}>{upcomingCount}</Text>
                <Text style={styles.tileLabel}>UPCOMING FIXTURES</Text>
              </Pressable>
            </Link>
            <View style={styles.tile} accessible accessibilityLabel={`${history.length} debriefs logged`}>
              <Text style={styles.tileNumber}>{history.length}</Text>
              <Text style={styles.tileLabel}>DEBRIEFS LOGGED</Text>
            </View>
            <View
              style={[styles.tile, styles.tileDisabled]}
              accessible
              accessibilityLabel="Training — coming soon">
              <Text style={styles.tileComingSoon}>SOON</Text>
              <Text style={styles.tileLabel}>TRAINING</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          <View style={styles.activityCard}>
            {history.length === 0 ? (
              <Text style={styles.nextMeta}>No debriefs yet.</Text>
            ) : (
              [...history]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 5)
                .map((record) => (
                  <View key={record.id} style={styles.activityRow}>
                    <View style={styles.activityAccent} />
                    <View style={styles.activityTextBlock}>
                      <Text style={styles.activityDate}>{formatFixtureDate(record.createdAt)}</Text>
                      <Text style={styles.activityBody} numberOfLines={2}>
                        {record.echoResponse}
                      </Text>
                    </View>
                  </View>
                ))
            )}
          </View>

          <View style={styles.navLinkRow}>
            <Link href="/fixtures" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="View all fixtures">
                <Text style={styles.fixturesLink}>View all fixtures</Text>
              </Pressable>
            </Link>
            <Link href="/mind-map" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="View mind map">
                <Text style={styles.fixturesLink}>View mind map</Text>
              </Pressable>
            </Link>
          </View>

          {__DEV__ ? (
            <Pressable
              onPress={resetOnboarding}
              style={styles.devResetButton}
              accessibilityRole="button"
              accessibilityLabel="Reset onboarding (dev)">
              <Text style={styles.devResetText}>Reset onboarding (dev)</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
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

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatFixtureDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDay(iso: string): string {
  return new Date(iso).getDate().toString();
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CareerTheme.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  wordmark: {
    color: CareerTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  identityBanner: {
    backgroundColor: CareerTheme.surface,
    borderLeftWidth: 4,
    borderLeftColor: CareerTheme.accent,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  levelPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: CareerTheme.accent,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
  },
  levelPillText: {
    color: CareerTheme.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  archetypeName: {
    color: CareerTheme.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  identitySub: {
    color: CareerTheme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  sectionLabel: {
    color: CareerTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: Spacing.two,
  },
  nextCard: {
    flexDirection: 'row',
    backgroundColor: CareerTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CareerTheme.border,
    overflow: 'hidden',
  },
  dateBlock: {
    width: 72,
    backgroundColor: CareerTheme.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  dateDay: {
    color: CareerTheme.accent,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  dateMonth: {
    color: CareerTheme.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextCardBody: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  nextOpponent: {
    color: CareerTheme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  nextMeta: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: CareerTheme.accent,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  primaryButtonText: {
    color: CareerTheme.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: CareerTheme.accent,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  secondaryButtonText: {
    color: CareerTheme.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    backgroundColor: CareerTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CareerTheme.border,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  tileNumber: {
    color: CareerTheme.text,
    fontSize: 26,
    fontWeight: '800',
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileComingSoon: {
    color: CareerTheme.textMuted,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tileLabel: {
    color: CareerTheme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activityCard: {
    backgroundColor: CareerTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CareerTheme.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  activityRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  activityAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: CareerTheme.accent,
  },
  activityTextBlock: {
    flex: 1,
    gap: 2,
  },
  activityDate: {
    color: CareerTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  activityBody: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
    lineHeight: 19,
  },
  navLinkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  fixturesLink: {
    color: CareerTheme.accent,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  devResetButton: {
    alignItems: 'center',
    padding: Spacing.two,
  },
  devResetText: {
    color: CareerTheme.textMuted,
    fontSize: 13,
  },
});
