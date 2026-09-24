import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addFixture } from '@/lib/fixtures';

export function AddFixtureScreen() {
  const theme = useTheme();
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('');
  const [date, setDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = opponent.trim().length > 0 && !saving;

  function handlePickDate() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        onChange: (_event, selectedDate) => {
          if (selectedDate) setDate(selectedDate);
        },
      });
    } else {
      setShowIOSPicker(true);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    await addFixture({
      opponent: opponent.trim(),
      date: date.toISOString(),
      competition: competition.trim() || undefined,
    });
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Add a fixture" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            OPPONENT
          </ThemedText>
          <TextInput
            value={opponent}
            onChangeText={setOpponent}
            placeholder="Who are you playing?"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Opponent"
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            DATE
          </ThemedText>
          <Pressable
            onPress={handlePickDate}
            accessibilityRole="button"
            accessibilityLabel={`Fixture date, ${formatDate(date)}`}
            accessibilityHint="Opens a date picker">
            <ThemedView type="backgroundElement" style={styles.dateButton}>
              <ThemedText type="default">{formatDate(date)}</ThemedText>
            </ThemedView>
          </Pressable>
          {Platform.OS === 'ios' && showIOSPicker ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="inline"
              onChange={(_event, selectedDate) => {
                setShowIOSPicker(false);
                if (selectedDate) setDate(selectedDate);
              }}
            />
          ) : null}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            COMPETITION (OPTIONAL)
          </ThemedText>
          <TextInput
            value={competition}
            onChangeText={setCompetition}
            placeholder="League, cup, friendly..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Competition, optional"
          />

          <PrimaryButton label="Save fixture" onPress={handleSave} disabled={!canSave} style={styles.saveButton} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  label: {
    letterSpacing: 0.5,
    marginTop: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 16,
  },
  dateButton: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  saveButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.four,
  },
});
