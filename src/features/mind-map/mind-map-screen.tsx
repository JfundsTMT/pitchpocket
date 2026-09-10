import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { deleteDebriefRecord, loadDebriefHistory, type DebriefRecord } from '@/lib/debrief-history';
import { loadFixtures, type Fixture } from '@/lib/fixtures';

const NODE_SIZE = 68;
const BASE_RADIUS = 60;
const RADIUS_STEP = 36;
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);

type LaidOutNode = { record: DebriefRecord; x: number; y: number };

export function MindMapScreen() {
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadDebriefHistory(), loadFixtures()]).then(([loadedHistory, loadedFixtures]) => {
        setHistory(loadedHistory);
        setFixtures(loadedFixtures);
        setLoaded(true);
      });
    }, []),
  );

  const ordered = useMemo(() => [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [history]);

  const layout = useMemo(() => {
    const maxRadius = BASE_RADIUS + ordered.length * RADIUS_STEP;
    const canvasSize = Math.max(400, maxRadius * 2 + NODE_SIZE * 2);
    const center = canvasSize / 2;
    const nodes: LaidOutNode[] = ordered.map((record, i) => {
      const angle = i * GOLDEN_ANGLE;
      const radius = BASE_RADIUS + i * RADIUS_STEP;
      return {
        record,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    });
    return { canvasSize, nodes };
  }, [ordered]);

  const selected = layout.nodes.find((n) => n.record.id === selectedId)?.record ?? null;

  function opponentFor(record: DebriefRecord): string | undefined {
    return fixtures.find((f) => f.id === record.fixtureId)?.opponent;
  }

  async function handleDelete(record: DebriefRecord) {
    await deleteDebriefRecord(record.id);
    setHistory((current) => current.filter((r) => r.id !== record.id));
    setSelectedId(null);
  }

  if (!loaded) {
    return (
      <View style={[styles.root, styles.loadingContainer]}>
        <ActivityIndicator color={CareerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backLink}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Mind Map</Text>
          <View style={styles.headerSpacer} />
        </View>

        {ordered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No debriefs yet — your map fills in as you debrief.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ width: layout.canvasSize, height: layout.canvasSize }}>
                {layout.nodes.slice(1).map((node, i) => (
                  <ConnectorLine key={`line-${node.record.id}`} from={layout.nodes[i]} to={node} />
                ))}
                {layout.nodes.map((node, i) => {
                  const isLatest = i === layout.nodes.length - 1;
                  const opponent = opponentFor(node.record);
                  return (
                    <Pressable
                      key={node.record.id}
                      onPress={() => setSelectedId(node.record.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Debrief from ${formatShortDate(node.record.createdAt)}${opponent ? ` vs ${opponent}` : ''}`}
                      style={[
                        styles.node,
                        isLatest && styles.nodeLatest,
                        { left: node.x - NODE_SIZE / 2, top: node.y - NODE_SIZE / 2 },
                      ]}>
                      <Text style={[styles.nodeDate, isLatest && styles.nodeDateLatest]} numberOfLines={1}>
                        {formatShortDate(node.record.createdAt)}
                      </Text>
                      {opponent ? (
                        <Text
                          style={[styles.nodeOpponent, isLatest && styles.nodeOpponentLatest]}
                          numberOfLines={1}>
                          {opponent}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </SafeAreaView>

      {selected ? (
        <DebriefDetailSheet
          record={selected}
          opponent={opponentFor(selected)}
          onClose={() => setSelectedId(null)}
          onDelete={() => handleDelete(selected)}
        />
      ) : null}
    </View>
  );
}

function ConnectorLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <View
      style={[
        styles.connector,
        {
          width: distance,
          left: midX - distance / 2,
          top: midY - 0.75,
          transform: [{ rotate: `${angleDeg}deg` }],
        },
      ]}
    />
  );
}

function DebriefDetailSheet({
  record,
  opponent,
  onClose,
  onDelete,
}: {
  record: DebriefRecord;
  opponent?: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  function confirmDelete() {
    Alert.alert('Delete this debrief', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={styles.sheet}>
        <Text style={styles.sheetDate}>
          {new Date(record.createdAt).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        {opponent ? <Text style={styles.sheetOpponent}>vs {opponent}</Text> : null}
        <ScrollView style={styles.sheetScroll}>
          {record.turns.map((turn, index) => (
            <View key={index} style={index > 0 ? styles.sheetTurnSpaced : undefined}>
              <Text style={styles.sheetLabel}>YOU</Text>
              <Text style={styles.sheetBody}>{turn.transcript}</Text>
              <Text style={[styles.sheetLabel, styles.sheetLabelSpaced]}>ECHO</Text>
              <Text style={styles.sheetBody}>{turn.echoResponse}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={confirmDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete this debrief">
          <Text style={styles.deleteButtonText}>Delete this debrief</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CareerTheme.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  backLink: {
    color: CareerTheme.accent,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 50,
  },
  title: {
    color: CareerTheme.text,
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    minWidth: 50,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  emptyText: {
    color: CareerTheme.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  connector: {
    position: 'absolute',
    height: 1.5,
    backgroundColor: CareerTheme.border,
  },
  node: {
    position: 'absolute',
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    backgroundColor: CareerTheme.surfaceRaised,
    borderWidth: 2,
    borderColor: CareerTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.half,
  },
  nodeLatest: {
    backgroundColor: CareerTheme.accent,
  },
  nodeDate: {
    color: CareerTheme.text,
    fontSize: 11,
    fontWeight: '700',
  },
  nodeDateLatest: {
    color: CareerTheme.accentText,
  },
  nodeOpponent: {
    color: CareerTheme.textMuted,
    fontSize: 9,
    maxWidth: NODE_SIZE - 8,
  },
  nodeOpponentLatest: {
    color: CareerTheme.accentText,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: CareerTheme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
    maxHeight: '75%',
  },
  sheetDate: {
    color: CareerTheme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetOpponent: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
  },
  sheetScroll: {
    marginTop: Spacing.two,
  },
  sheetLabel: {
    color: CareerTheme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Spacing.one,
  },
  sheetLabelSpaced: {
    marginTop: Spacing.three,
  },
  sheetTurnSpaced: {
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: CareerTheme.border,
  },
  sheetBody: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  deleteButton: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderColor: '#E5484D',
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#E5484D',
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    marginTop: Spacing.one,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  closeButtonText: {
    color: CareerTheme.textMuted,
    fontSize: 14,
  },
});
