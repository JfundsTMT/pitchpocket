import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
        <ScreenHeader title="Fixtures" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PrimaryButton label="Add a fixture" onPress={() => router.push('/add-fixture')} />

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
                    <PrimaryButton
                      label="Debrief with Echo"
                      onPress={() => router.push({ pathname: '/debrief', params: { fixtureId: fixture.id } })}
                    />
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
  sectionLabel: {
    letterSpacing: 0.5,
    marginTop: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  deleteLink: {
    textDecorationLine: 'underline',
    marginTop: Spacing.half,
  },
});
