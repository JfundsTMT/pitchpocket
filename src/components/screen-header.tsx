import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  // Some screens need to block navigating away mid-action (recording,
  // an in-flight request) without the title jumping around — this swaps
  // the back control for an equal-width spacer rather than hiding the
  // whole header.
  hideBack?: boolean;
};

// The one back-button + title treatment for every utility screen. Before
// this existed, screens each rolled their own — a floating text link above
// a 48px display title on some, a raw-Text version on another, a bespoke
// nav-bar row on Mind Map alone — so the "this is a page header" signal
// changed shape every time the player moved between screens. This is that
// nav-bar pattern (Mind Map's, the best of the five) made shared.
//
// Deliberately NOT used on Home (root, no back target) or on ritual screens
// like Pre-Match Reset, which intentionally have no standard chrome — see
// CLAUDE.md's design brief on reproducing career-mode rituals.
export function ScreenHeader({ title, onBack, hideBack }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {hideBack ? (
        <View style={styles.backButton} />
      ) : (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  backButton: {
    minWidth: 50,
  },
  backText: {
    color: CareerTheme.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: CareerTheme.text,
    fontSize: 17,
    fontWeight: '700',
  },
  spacer: {
    minWidth: 50,
  },
});
