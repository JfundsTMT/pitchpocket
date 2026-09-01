import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { isSyncConfigured } from '@/lib/supabase';

export function EchoIntroStep() {
  return (
    <>
      <ThemedText type="title" style={styles.title}>
        I’m Echo.
      </ThemedText>
      <ThemedText type="default" style={styles.body}>
        I’m not your coach, and I’m not rating you for anyone else. I’m just here to help you see
        your own game clearly — this match, and every one after it.
      </ThemedText>
      {isSyncConfigured ? (
        <Pressable
          onPress={() => router.push('/account')}
          style={styles.restoreLink}
          accessibilityRole="button"
          accessibilityLabel="Restore an existing career">
          <ThemedText type="small" themeColor="textSecondary" style={styles.restoreText}>
            Already have a career on another phone? Restore it
          </ThemedText>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.three,
  },
  body: {
    lineHeight: 24,
  },
  restoreLink: {
    marginTop: Spacing.four,
    alignSelf: 'flex-start',
  },
  restoreText: {
    textDecorationLine: 'underline',
  },
});
