import { useFocusEffect } from '@react-navigation/native';
import { Link, Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import { AGE_BRACKETS, FEET } from '@/features/onboarding/onboarding-options';
import { loadDebriefHistory, type DebriefRecord } from '@/lib/debrief-history';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
import { loadPlayerProfile, type PlayerProfile } from '@/lib/player-profile';
import { syncNow } from '@/lib/sync';

// Local palette for the broadcast-hub look. The anatomy follows the classic
// console career-hub grammar (angled club banner, tab strip, advance
// calendar, light data cards on a dark stadium field) — colour values and
// copy are entirely our own: pitch green + volt on near-black, not
// stadium blue.
const Hub = {
  field: '#0A0F0C',
  heroPanel: '#0E2B1C',
  volt: '#A9E92C',
  cardLight: '#EEF0F3',
  cardInk: '#171A20',
  cardSubtle: '#59606D',
  cardRule: '#D8DBE0',
  mintRow: '#BEEFD2',
  badgeRed: '#E5484D',
  tabIdle: 'rgba(255,255,255,0.08)',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const STRIP_DAYS = 5;

export default function HomeScreen() {
  const { status, resetOnboarding } = useOnboardingGate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (status !== 'complete') return;
      let cancelled = false;
      const loadAll = () =>
        Promise.all([loadPlayerProfile(), loadFixtures(), loadDebriefHistory()]).then(
          ([loadedProfile, loadedFixtures, loadedHistory]) => {
            if (cancelled) return;
            setProfile(loadedProfile);
            setFixtures(loadedFixtures);
            setHistory(loadedHistory);
            setDataLoaded(true);
          },
        );
      loadAll();
      // Background sync after the local render; reload only if it pulled
      // anything new — the network is never on the critical path.
      syncNow().then(({ changed }) => {
        if (changed && !cancelled) loadAll();
      });
      return () => {
        cancelled = true;
      };
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
  const sortedHistory = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestDebrief = sortedHistory[0];
  const stripDays = buildCalendarStrip(nextFixture?.date ?? null);
  const heroHeadline = fixtureNeedingDebrief ? 'FULL TIME' : nextFixture ? 'MATCHDAY' : 'ADVANCE';
  const monthAnchor = nextFixture ? new Date(nextFixture.date) : new Date();
  const positionCode = profile.position.replace('_', '/');
  const ageLabel = AGE_BRACKETS.find((b) => b.id === profile.ageBracket)?.label ?? '—';
  const footLabel = FEET.find((f) => f.id === profile.foot)?.label ?? '—';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Angled identity banner + ambition ticker — the club plate */}
          <View style={styles.plateRow}>
            <View style={styles.plate}>
              <View style={styles.plateInner}>
                <View style={styles.crest}>
                  <Text style={styles.crestText}>{positionCode}</Text>
                </View>
                <View style={styles.plateTextBlock}>
                  <Text style={styles.plateName} numberOfLines={1}>
                    {identity.archetypeName}
                  </Text>
                  <Text style={styles.plateSub} numberOfLines={1}>
                    {identity.level}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.ticker} numberOfLines={1}>
            “{identity.ambition}”
          </Text>

          {/* Tab strip — CENTRAL active, siblings are real destinations */}
          <View style={styles.tabRow}>
            <View style={[styles.tab, styles.tabActive]}>
              <Text style={styles.tabActiveText}>CENTRAL</Text>
            </View>
            <Link href="/fixtures" asChild>
              <Pressable style={styles.tab} accessibilityRole="button" accessibilityLabel="Fixtures tab">
                <Text style={styles.tabText}>FIXTURES</Text>
                {fixtureNeedingDebrief ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>1</Text>
                  </View>
                ) : null}
              </Pressable>
            </Link>
            <Link href="/mind-map" asChild>
              <Pressable style={styles.tab} accessibilityRole="button" accessibilityLabel="Mind map tab">
                <Text style={styles.tabText}>MIND MAP</Text>
              </Pressable>
            </Link>
          </View>

          {/* Hero advance panel with the week strip */}
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <Text style={styles.heroHeadline}>{heroHeadline}</Text>
              <Text style={styles.heroMonth}>{formatMonthYear(monthAnchor)}</Text>
            </View>
            <View style={styles.stripRow}>
              {stripDays.map((day) => (
                <View key={day.date.toISOString()} style={styles.stripCell}>
                  <Text style={[styles.stripWeekday, day.isMatchday && styles.stripMatchText]}>
                    {formatWeekday(day.date)}
                  </Text>
                  <Text style={[styles.stripNumber, day.isMatchday && styles.stripMatchText]}>
                    {day.date.getDate()}
                  </Text>
                  {day.isMatchday && nextFixture ? (
                    <View style={styles.stripCrest}>
                      <Text style={styles.stripCrestText}>{initials(nextFixture.opponent)}</Text>
                    </View>
                  ) : (
                    <View style={styles.stripDot} />
                  )}
                </View>
              ))}
            </View>
            <View style={styles.heroRule} />
            {nextFixture ? (
              <>
                <Text style={styles.heroOpponent}>vs {nextFixture.opponent}</Text>
                {nextFixture.competition ? <Text style={styles.heroMeta}>{nextFixture.competition}</Text> : null}
              </>
            ) : (
              <Text style={styles.heroMeta}>No fixture set yet.</Text>
            )}
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/debrief',
                  params: fixtureNeedingDebrief ? { fixtureId: fixtureNeedingDebrief.id } : {},
                })
              }
              style={styles.heroButton}
              accessibilityRole="button"
              accessibilityLabel="Debrief with Echo">
              <Text style={styles.heroButtonText}>DEBRIEF WITH ECHO</Text>
            </Pressable>
            {!nextFixture ? (
              <Link href="/add-fixture" asChild>
                <Pressable style={styles.heroGhostButton} accessibilityRole="button" accessibilityLabel="Add a fixture">
                  <Text style={styles.heroGhostButtonText}>ADD YOUR NEXT FIXTURE</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>

          {/* Light data cards — pro sheet and debrief log */}
          <View style={styles.gridRow}>
            <View style={[styles.lightCard, styles.gridCell]}>
              <Text style={styles.lightCardTitle}>MY PRO</Text>
              <Text style={styles.proPosition}>{positionCode}</Text>
              <StatRow label="Level" value={identity.level} />
              <StatRow label="Age" value={ageLabel} />
              <StatRow label="Foot" value={footLabel} />
              <StatRow label="Debriefs" value={String(history.length)} />
              <StatRow label="Fixtures" value={String(upcomingCount)} />
            </View>

            <View style={[styles.lightCard, styles.gridCell]}>
              <Text style={styles.lightCardTitle}>DEBRIEF LOG</Text>
              {sortedHistory.length === 0 ? (
                <Text style={styles.logEmpty}>No debriefs yet — your log fills in after your first one.</Text>
              ) : (
                sortedHistory.slice(0, 4).map((record, index) => (
                  <View key={record.id} style={[styles.logRow, index === 0 && styles.logRowLatest]}>
                    <Text style={styles.logRank}>{sortedHistory.length - index}</Text>
                    <Text style={styles.logName} numberOfLines={1}>
                      {opponentFor(record, fixtures) ?? 'Check-in'}
                    </Text>
                    <Text style={styles.logDate}>{formatShortDate(record.createdAt)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Echo broadcast card — breaking-news ribbon */}
          <View style={styles.newsCard}>
            <View style={styles.newsRibbonRow}>
              <View style={styles.newsRibbonChip}>
                <Text style={styles.newsRibbonChipText}>ECHO</Text>
              </View>
              <View style={styles.newsRibbonBar}>
                <Text style={styles.newsRibbonBarText} numberOfLines={1}>
                  {latestDebrief ? 'LATEST DEBRIEF' : 'AWAITING FIRST DEBRIEF'}
                </Text>
              </View>
            </View>
            <Text style={styles.newsBody} numberOfLines={3}>
              {latestDebrief
                ? latestDebrief.echoResponse
                : 'Your story starts after your first debrief. Echo is ready when you are.'}
            </Text>
          </View>

          {/* Training scaffold — deliberately not wired up yet */}
          <View style={[styles.lightCard, styles.trainingCard]}>
            <View style={styles.trainingHeader}>
              <Text style={styles.lightCardTitle}>TRAINING</Text>
              <View style={styles.soonPill}>
                <Text style={styles.soonPillText}>COMING SOON</Text>
              </View>
            </View>
            <Text style={styles.trainingBody}>
              Grow your game between matches with focus blocks and training sessions.
            </Text>
          </View>

          {/* Footer control hints — every chip is a real action */}
          <View style={styles.hintRow}>
            <Pressable
              onPress={() => router.push('/debrief')}
              style={styles.hint}
              accessibilityRole="button"
              accessibilityLabel="Debrief">
              <View style={[styles.hintKey, { backgroundColor: CareerTheme.accent }]}>
                <Text style={styles.hintKeyTextDark}>D</Text>
              </View>
              <Text style={styles.hintLabel}>Debrief</Text>
            </Pressable>
            <Link href="/fixtures" asChild>
              <Pressable style={styles.hint} accessibilityRole="button" accessibilityLabel="Fixtures">
                <View style={[styles.hintKey, { backgroundColor: Hub.cardLight }]}>
                  <Text style={styles.hintKeyTextDark}>F</Text>
                </View>
                <Text style={styles.hintLabel}>Fixtures</Text>
              </Pressable>
            </Link>
            <Link href="/mind-map" asChild>
              <Pressable style={styles.hint} accessibilityRole="button" accessibilityLabel="Mind map">
                <View style={[styles.hintKey, { backgroundColor: Hub.volt }]}>
                  <Text style={styles.hintKeyTextDark}>M</Text>
                </View>
                <Text style={styles.hintLabel}>Mind Map</Text>
              </Pressable>
            </Link>
            <Link href="/account" asChild>
              <Pressable style={styles.hint} accessibilityRole="button" accessibilityLabel="Account and backup">
                <View style={[styles.hintKey, { backgroundColor: Hub.badgeRed }]}>
                  <Text style={styles.hintKeyTextLight}>A</Text>
                </View>
                <Text style={styles.hintLabel}>Account</Text>
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
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

// Five-day window ending on the matchday, matching the console advance strip
// where the fixture sits at the end of the visible week. With no fixture the
// strip just shows the next five days, nothing highlighted.
function buildCalendarStrip(matchIso: string | null): { date: Date; isMatchday: boolean }[] {
  const anchor = matchIso ? new Date(matchIso) : new Date();
  return Array.from({ length: STRIP_DAYS }, (_, i) => {
    const offset = matchIso ? i - (STRIP_DAYS - 1) : i;
    return {
      date: new Date(anchor.getTime() + offset * DAY_MS),
      isMatchday: matchIso !== null && i === STRIP_DAYS - 1,
    };
  });
}

function opponentFor(record: DebriefRecord, fixtures: Fixture[]): string | undefined {
  if (!record.fixtureId) return undefined;
  return fixtures.find((f) => f.id === record.fixtureId)?.opponent;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatMonthYear(date: Date): string {
  return `${date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()} ${date.getFullYear()}`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Hub.field,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  plateRow: {
    flexDirection: 'row',
  },
  plate: {
    backgroundColor: Hub.cardLight,
    borderRadius: 4,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.four,
    transform: [{ skewX: '-12deg' }],
    marginLeft: Spacing.one,
  },
  plateInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    transform: [{ skewX: '12deg' }],
  },
  crest: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CareerTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestText: {
    color: Hub.cardInk,
    fontSize: 13,
    fontWeight: '900',
  },
  plateTextBlock: {
    gap: 1,
  },
  plateName: {
    color: Hub.cardInk,
    fontSize: 17,
    fontWeight: '800',
    maxWidth: 220,
  },
  plateSub: {
    color: Hub.cardSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  ticker: {
    color: CareerTheme.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: Spacing.one,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Hub.tabIdle,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  tabActive: {
    backgroundColor: Hub.cardLight,
    borderTopWidth: 3,
    borderTopColor: Hub.badgeRed,
  },
  tabActiveText: {
    color: Hub.cardInk,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabText: {
    color: CareerTheme.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tabBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Hub.badgeRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  hero: {
    backgroundColor: Hub.heroPanel,
    borderRadius: 6,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  heroHeadline: {
    color: Hub.volt,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroMonth: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  stripCell: {
    alignItems: 'center',
    gap: 3,
    width: 52,
  },
  stripWeekday: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
  },
  stripNumber: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 22,
    fontWeight: '700',
  },
  stripMatchText: {
    color: CareerTheme.accent,
  },
  stripCrest: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Hub.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripCrestText: {
    color: Hub.cardInk,
    fontSize: 9,
    fontWeight: '900',
  },
  stripDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 8,
  },
  heroRule: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroOpponent: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  heroButton: {
    backgroundColor: Hub.volt,
    borderRadius: 4,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  heroButtonText: {
    color: Hub.cardInk,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroGhostButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 4,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  heroGhostButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gridCell: {
    flex: 1,
  },
  lightCard: {
    backgroundColor: Hub.cardLight,
    borderRadius: 6,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  lightCardTitle: {
    color: Hub.cardInk,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  proPosition: {
    color: Hub.cardInk,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: Spacing.one,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Hub.cardRule,
    paddingVertical: Spacing.one + 1,
    gap: Spacing.two,
  },
  statLabel: {
    color: Hub.cardSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    color: Hub.cardInk,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  logEmpty: {
    color: Hub.cardSubtle,
    fontSize: 12,
    lineHeight: 17,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 1,
    paddingHorizontal: Spacing.one,
    borderRadius: 3,
  },
  logRowLatest: {
    backgroundColor: Hub.mintRow,
  },
  logRank: {
    color: Hub.cardSubtle,
    fontSize: 12,
    fontWeight: '800',
    width: 14,
  },
  logName: {
    color: Hub.cardInk,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  logDate: {
    color: Hub.cardSubtle,
    fontSize: 11,
    fontWeight: '700',
  },
  newsCard: {
    backgroundColor: CareerTheme.surface,
    borderRadius: 6,
    overflow: 'hidden',
  },
  newsRibbonRow: {
    flexDirection: 'row',
  },
  newsRibbonChip: {
    backgroundColor: Hub.volt,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  newsRibbonChipText: {
    color: Hub.cardInk,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  newsRibbonBar: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
  },
  newsRibbonBarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  newsBody: {
    color: CareerTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    padding: Spacing.three,
  },
  trainingCard: {
    gap: Spacing.one,
  },
  trainingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soonPill: {
    borderWidth: 1,
    borderColor: Hub.cardSubtle,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
  },
  soonPillText: {
    color: Hub.cardSubtle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  trainingBody: {
    color: Hub.cardSubtle,
    fontSize: 13,
    lineHeight: 19,
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  hintKey: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintKeyTextDark: {
    color: Hub.cardInk,
    fontSize: 11,
    fontWeight: '900',
  },
  hintKeyTextLight: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  hintLabel: {
    color: CareerTheme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
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
