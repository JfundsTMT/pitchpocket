import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadDebriefHistory, type DebriefRecord } from '@/lib/debrief-history';
import { deleteFixture, loadFixtures, type Fixture } from '@/lib/fixtures';

export function FixturesListScreen() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadFixtures(), loadDebriefHistory()]).then(([loadedFixtures, loadedHistory]) => {
        setFixtures(loadedFixtures);
        setHistory(loadedHistory);
        setLoaded(true);
      });
    }, []),
  );

  function confirmDelete(fixture: Fixture) {
    Alert.alert('Delete fixture', `Remove vs ${fixture.opponent} from your fixtures? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFixture(fixture.id);
          setFixtures((current) => current.filter((f) => f.id !== fixture.id));
        },
      },
    ]);
  }

  if (!loaded) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const debriefedFixtureIds = new Set(history.map((r) => r.fixtureId).filter(Boolean));
  const now = Date.now();
  const upcoming = fixtures
    .filter((f) => new Date(f.date).getTime() >= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = fixtures
    .filter((f) => new Date(f.date).getTime() < now)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backLink}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <ThemedText type="small" themeColor="textSecondary">
              ‹ Back
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            Fixtures
          </ThemedText>

          <Link href="/add-fixture" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Add a fixture">
              <PrimaryButtonInner label="Add a fixture" />
            </Pressable>
          </Link>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            UPCOMING
          </ThemedText>
          {upcoming.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing booked yet.
            </ThemedText>
          ) : (
            upcoming.map((fixture) => (
              <ThemedView key={fixture.id} type="backgroundElement" style={styles.row}>
                <ThemedText type="default">
                  vs {fixture.opponent} — {formatFixtureDate(fixture.date)}
                </ThemedText>
                {fixture.competition ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {fixture.competition}
                  </ThemedText>
                ) : null}
                <Pressable
                  onPress={() => confirmDelete(fixture)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete fixture vs ${fixture.opponent}`}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.deleteLink}>
                    Delete
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ))
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            PAST
          </ThemedText>
          {past.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No past fixtures yet.
            </ThemedText>
          ) : (
            past.map((fixture) => {
              const debriefed = debriefedFixtureIds.has(fixture.id);
              return (
                <ThemedView key={fixture.id} type="backgroundElement" style={styles.row}>
                  <ThemedText type="default">
                    vs {fixture.opponent} — {formatFixtureDate(fixture.date)}
                  </ThemedText>
                  {fixture.competition ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {fixture.competition}
                    </ThemedText>
                  ) : null}
                  {debriefed ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Debriefed
                    </ThemedText>
                  ) : (
                    <Pressable
                      onPress={() => router.push({ pathname: '/debrief', params: { fixtureId: fixture.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={`Debrief with Echo about vs ${fixture.opponent}`}>
                      <PrimaryButtonInner label="Debrief with Echo" />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => confirmDelete(fixture)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete fixture vs ${fixture.opponent}`}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.deleteLink}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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

function formatFixtureDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  title: {
    marginBottom: Spacing.one,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  sectionLabel: {
    letterSpacing: 0.5,
    marginTop: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  deleteLink: {
    textDecorationLine: 'underline',
    marginTop: Spacing.half,
  },
});
