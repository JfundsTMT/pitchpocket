import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

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
});
