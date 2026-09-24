import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

// The one "this is the button to press" visual signature. Before this
// existed, the primary action was a different fill on every screen family
// — near-white on some, teal-green on others, a completely different
// yellow-green on Home's hero CTA. CareerTheme.accent is the canonical
// brand color; every primary action should render this exact fill.
export function PrimaryButton({ label, onPress, disabled, busy, style }: PrimaryButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, { opacity: isDisabled ? 0.4 : 1 }, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}>
      {busy ? <ActivityIndicator color={CareerTheme.accentText} /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: CareerTheme.accent,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: CareerTheme.accentText,
    fontSize: 15,
    fontWeight: '700',
  },
});
