import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { loadFlowRecipe, type FlowItem } from '@/lib/flow-recipe';

// The consumption side of the Flow Recipe — a calm, unhurried ritual before
// a match, not a dashboard. Deliberately shows at most 3 reminders: this is
// meant to be read in 30 seconds, not studied.
const MAX_REMINDERS = 3;

export function PreMatchResetScreen() {
  const [items, setItems] = useState<FlowItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadFlowRecipe().then((recipe) => setItems(recipe.items.slice(0, MAX_REMINDERS)));
    }, []),
  );

  if (items === null) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={CareerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.body}>
          <Text style={styles.eyebrow}>30 SECONDS</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>
              Your Flow Recipe is empty — add reminders from your own evidence and they&apos;ll show up here before
              kickoff.
            </Text>
          ) : (
            <View style={styles.reminders}>
              {items.map((item) => (
                <Text key={item.id} style={styles.reminderText}>
                  {item.label}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.ready}>Calm. Quiet. Ready.</Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={styles.doneButton}
          accessibilityRole="button"
          accessibilityLabel="Ready">
          <Text style={styles.doneButtonText}>READY</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
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
    justifyContent: 'space-between',
    padding: Spacing.five,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  eyebrow: {
    color: CareerTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
  },
  reminders: {
    gap: Spacing.four,
  },
  reminderText: {
    color: CareerTheme.text,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  emptyText: {
    color: CareerTheme.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  ready: {
    color: CareerTheme.accent,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1,
  },
  doneButton: {
    backgroundColor: CareerTheme.accent,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  doneButtonText: {
    color: CareerTheme.accentText,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
