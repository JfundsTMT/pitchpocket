import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useTheme } from '@/hooks/use-theme';
import { buildRecentDebriefContext, loadDebriefHistory } from '@/lib/debrief-history';
import { synthesizeFlowRecipe } from '@/lib/echo-api';
import { loadFlowRecipe, newFlowItem, saveFlowRecipe, type FlowItem } from '@/lib/flow-recipe';
import { loadPlayerProfile } from '@/lib/player-profile';

export function FlowRecipeScreen() {
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesizeError, setSynthesizeError] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadFlowRecipe().then((recipe) => {
        setItems(recipe.items);
        setLoaded(true);
      });
    }, []),
  );

  async function persist(next: FlowItem[]) {
    setItems(next);
    await saveFlowRecipe(next);
  }

  async function handleAdd() {
    const label = newItemText.trim();
    if (!label) return;
    setNewItemText('');
    await persist([...items, newFlowItem(label)]);
  }

  function handleStartEdit(item: FlowItem) {
    setEditingId(item.id);
    setEditingText(item.label);
  }

  async function handleCommitEdit() {
    const label = editingText.trim();
    const id = editingId;
    setEditingId(null);
    if (!id || !label) return;
    await persist(items.map((i) => (i.id === id ? { ...i, label } : i)));
  }

  function handleDelete(item: FlowItem) {
    Alert.alert('Remove this reminder', `"${item.label}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => persist(items.filter((i) => i.id !== item.id)) },
    ]);
  }

  async function handleSynthesize() {
    setSynthesizing(true);
    setSynthesizeError(null);
    const [profile, history] = await Promise.all([loadPlayerProfile(), loadDebriefHistory()]);
    if (!profile) {
      setSynthesizing(false);
      setSynthesizeError('Complete onboarding first — no player profile found.');
      return;
    }
    const result = await synthesizeFlowRecipe(resolvePlayerContext(profile), buildRecentDebriefContext(history));
    setSynthesizing(false);
    if (!result.ok) {
      setSynthesizeError(result.error.message);
      return;
    }
    if (result.data.items.length === 0) {
      setSynthesizeError("Nothing clear enough yet — debrief a bit more and try again.");
      return;
    }
    // Additive: never overwrite what the player already kept, skip exact
    // repeats of an existing label.
    const existingLabels = new Set(items.map((i) => i.label.trim().toLowerCase()));
    const fresh = result.data.items
      .filter((i) => !existingLabels.has(i.label.trim().toLowerCase()))
      .map((i) => newFlowItem(i.label, i.evidence));
    if (fresh.length === 0) {
      setSynthesizeError('Nothing new to add — your recipe already covers it.');
      return;
    }
    await persist([...items, ...fresh]);
  }

  const theme = useTheme();

  if (!loaded) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Flow Recipe" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
            Your personal conditions for your best football — not advice, evidence from your own performances. Add,
            edit, or remove anything; it&apos;s yours.
          </ThemedText>

          {items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing here yet. Add your own, or let Echo draft a starting point from your debriefs.
            </ThemedText>
          ) : (
            items.map((item) =>
              editingId === item.id ? (
                <ThemedView key={item.id} type="backgroundElement" style={styles.itemCard}>
                  <TextInput
                    value={editingText}
                    onChangeText={setEditingText}
                    autoFocus
                    onSubmitEditing={handleCommitEdit}
                    onBlur={handleCommitEdit}
                    style={[styles.editInput, { color: theme.text }]}
                    accessibilityLabel="Edit reminder"
                  />
                </ThemedView>
              ) : (
                <ThemedView key={item.id} type="backgroundElement" style={styles.itemCard}>
                  <Pressable onPress={() => handleStartEdit(item)} style={styles.itemTextArea}>
                    <ThemedText type="default">{item.label}</ThemedText>
                    {item.evidence ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.evidenceText}>
                        {item.evidence}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove: ${item.label}`}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.removeLink}>
                      Remove
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ),
            )
          )}

          <ThemedView style={styles.addRow}>
            <TextInput
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Add your own reminder…"
              placeholderTextColor={theme.textSecondary}
              onSubmitEditing={handleAdd}
              style={[styles.addInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              accessibilityLabel="New reminder"
            />
            <PrimaryButton label="Add" onPress={handleAdd} style={styles.addButton} />
          </ThemedView>

          {synthesizeError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {synthesizeError}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleSynthesize}
            disabled={synthesizing}
            style={[styles.synthesizeButton, { borderColor: theme.text, opacity: synthesizing ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Let Echo draft suggestions">
            <ThemedText type="smallBold">{synthesizing ? 'Reading your debriefs…' : 'Let Echo draft suggestions'}</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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
  subtitle: { marginBottom: Spacing.two, lineHeight: 20 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  itemTextArea: { flex: 1, gap: 2 },
  evidenceText: { fontStyle: 'italic' },
  removeLink: { textDecorationLine: 'underline' },
  editInput: { flex: 1, fontSize: 16, paddingVertical: 2 },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  addInput: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  addButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  synthesizeButton: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
