import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CareerTheme } from '@/constants/career-theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

// A render-time crash anywhere in the tree should never show a blank white
// screen or the raw red-box in a released build — the player's data is safe
// in AsyncStorage regardless, so the recovery path is just "try rendering
// again," which resolves anything transient.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            PitchPocket hit an unexpected error. Your saved fixtures and debriefs are untouched — try again.
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Try again">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CareerTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    color: CareerTheme.text,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    backgroundColor: CareerTheme.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: CareerTheme.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
});
