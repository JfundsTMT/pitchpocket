import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { deleteDebriefRecord, loadDebriefHistory, type DebriefRecord, type DebriefTurn } from '@/lib/debrief-history';
import { draftFocusPlan } from '@/lib/echo-api';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
import { createFocusBlock, loadFocusBlocks, setFocusBlockStatus, type FocusBlock, type FocusBlockStatus } from '@/lib/focus-blocks';
import { deleteMindMapNode, loadMindMapNodes, type MindMapNode } from '@/lib/mind-map-nodes';
import { loadPlayerProfile, type PlayerProfile } from '@/lib/player-profile';

const NODE_SIZE = 68;
const BASE_RADIUS = 60;
const RADIUS_STEP = 36;
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);

type Laid<T> = { item: T; x: number; y: number };
type Tab = 'insights' | 'debriefs';

export function MindMapScreen() {
  const [tab, setTab] = useState<Tab>('insights');
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [history, setHistory] = useState<DebriefRecord[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [focusBlocks, setFocusBlocks] = useState<FocusBlock[]>([]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedDebriefId, setSelectedDebriefId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadMindMapNodes(), loadDebriefHistory(), loadFixtures(), loadFocusBlocks(), loadPlayerProfile()]).then(
        ([loadedNodes, loadedHistory, loadedFixtures, loadedFocusBlocks, loadedProfile]) => {
          setNodes(loadedNodes);
          setHistory(loadedHistory);
          setFixtures(loadedFixtures);
          setFocusBlocks(loadedFocusBlocks);
          setProfile(loadedProfile);
          setLoaded(true);
        },
      );
    }, []),
  );

  const orderedDebriefs = useMemo(
    () => [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [history],
  );
  const orderedNodes = useMemo(() => [...nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [nodes]);

  const debriefLayout = useLayout(orderedDebriefs);
  const nodeLayout = useLayout(orderedNodes);

  const selectedDebrief = history.find((r) => r.id === selectedDebriefId) ?? null;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function opponentFor(record: DebriefRecord): string | undefined {
    return fixtures.find((f) => f.id === record.fixtureId)?.opponent;
  }

  async function handleDeleteDebrief(record: DebriefRecord) {
    await deleteDebriefRecord(record.id);
    setHistory((current) => current.filter((r) => r.id !== record.id));
    setSelectedDebriefId(null);
  }

  async function handleDeleteNode(node: MindMapNode) {
    await deleteMindMapNode(node.id);
    setNodes((current) => current.filter((n) => n.id !== node.id));
    setSelectedNodeId(null);
  }

  // The turn whose accepted offer produced this node — that's where the
  // real specificity for a focus plan lives, not the bare node label.
  function originatingTurn(node: MindMapNode): DebriefTurn | undefined {
    if (!node.debriefId) return undefined;
    const record = history.find((r) => r.id === node.debriefId);
    return record?.turns.find((t) => t.nodeOffer?.status === 'accepted' && t.nodeOffer.label === node.label);
  }

  // Second entry point for starting a focus block (the first is live in the
  // debrief, right after pinning) — revisiting a pinned insight later and
  // deciding to actually train on it is just as valid a moment.
  async function handleStartFocusBlock(node: MindMapNode): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!profile) return { ok: false, message: 'Player profile not loaded yet — try again.' };
    const turn = originatingTurn(node);
    const result = await draftFocusPlan(resolvePlayerContext(profile), node.label, {
      transcript: turn?.transcript ?? '',
      echoResponse: turn?.echoResponse ?? '',
    });
    if (!result.ok || result.data.plan.length === 0) {
      return { ok: false, message: result.ok ? "Couldn't draft a plan from that — try again?" : result.error.message };
    }
    const block = await createFocusBlock({ nodeId: node.id, label: node.label, plan: result.data.plan });
    setFocusBlocks((current) => [...current, block]);
    return { ok: true };
  }

  async function handleSetFocusStatus(blockId: string, status: FocusBlockStatus) {
    const updated = await setFocusBlockStatus(blockId, status);
    if (updated) {
      setFocusBlocks((current) => current.map((b) => (b.id === blockId ? updated : b)));
    }
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

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setTab('insights')}
            style={[styles.tab, tab === 'insights' && styles.tabActive]}
            accessibilityRole="button"
            accessibilityLabel="Insights tab">
            <Text style={[styles.tabText, tab === 'insights' && styles.tabTextActive]}>INSIGHTS</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('debriefs')}
            style={[styles.tab, tab === 'debriefs' && styles.tabActive]}
            accessibilityRole="button"
            accessibilityLabel="Debriefs tab">
            <Text style={[styles.tabText, tab === 'debriefs' && styles.tabTextActive]}>DEBRIEFS</Text>
          </Pressable>
        </View>

        {tab === 'insights' ? (
          orderedNodes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No insights pinned yet — when you work something out for yourself in a debrief, Echo will offer to
                pin it here.
              </Text>
            </View>
          ) : (
            <Graph
              canvasSize={nodeLayout.canvasSize}
              positions={nodeLayout.nodes}
              renderNode={(laid: Laid<MindMapNode>, isLatest) => (
                <Pressable
                  key={laid.item.id}
                  onPress={() => setSelectedNodeId(laid.item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Insight: ${laid.item.label}`}
                  style={[
                    styles.node,
                    isLatest && styles.nodeLatest,
                    { left: laid.x - NODE_SIZE / 2, top: laid.y - NODE_SIZE / 2 },
                  ]}>
                  <Text style={[styles.nodeLabel, isLatest && styles.nodeLabelLatest]} numberOfLines={4}>
                    {laid.item.label}
                  </Text>
                </Pressable>
              )}
            />
          )
        ) : orderedDebriefs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No debriefs yet — your map fills in as you debrief.</Text>
          </View>
        ) : (
          <Graph
            canvasSize={debriefLayout.canvasSize}
            positions={debriefLayout.nodes}
            renderNode={(laid: Laid<DebriefRecord>, isLatest) => {
              const opponent = opponentFor(laid.item);
              return (
                <Pressable
                  key={laid.item.id}
                  onPress={() => setSelectedDebriefId(laid.item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Debrief from ${formatShortDate(laid.item.createdAt)}${opponent ? ` vs ${opponent}` : ''}`}
                  style={[
                    styles.node,
                    isLatest && styles.nodeLatest,
                    { left: laid.x - NODE_SIZE / 2, top: laid.y - NODE_SIZE / 2 },
                  ]}>
                  <Text style={[styles.nodeDate, isLatest && styles.nodeDateLatest]} numberOfLines={1}>
                    {formatShortDate(laid.item.createdAt)}
                  </Text>
                  {opponent ? (
                    <Text style={[styles.nodeOpponent, isLatest && styles.nodeOpponentLatest]} numberOfLines={1}>
                      {opponent}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>

      {selectedDebrief ? (
        <DebriefDetailSheet
          record={selectedDebrief}
          opponent={opponentFor(selectedDebrief)}
          onClose={() => setSelectedDebriefId(null)}
          onDelete={() => handleDeleteDebrief(selectedDebrief)}
        />
      ) : null}
      {selectedNode ? (
        <NodeDetailSheet
          node={selectedNode}
          focusBlock={focusBlocks.find((b) => b.nodeId === selectedNode.id)}
          onClose={() => setSelectedNodeId(null)}
          onDelete={() => handleDeleteNode(selectedNode)}
          onStartFocus={handleStartFocusBlock}
          onSetFocusStatus={handleSetFocusStatus}
        />
      ) : null}
    </View>
  );
}

// Shared spiral layout math for both the insight-node graph and the
// debrief-history graph — same visual language, different underlying data.
function useLayout<T>(items: T[]): { canvasSize: number; nodes: Laid<T>[] } {
  return useMemo(() => {
    const maxRadius = BASE_RADIUS + items.length * RADIUS_STEP;
    const canvasSize = Math.max(400, maxRadius * 2 + NODE_SIZE * 2);
    const center = canvasSize / 2;
    const nodes: Laid<T>[] = items.map((item, i) => {
      const angle = i * GOLDEN_ANGLE;
      const radius = BASE_RADIUS + i * RADIUS_STEP;
      return {
        item,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    });
    return { canvasSize, nodes };
  }, [items]);
}

function Graph<T extends { x: number; y: number }>({
  canvasSize,
  positions,
  renderNode,
}: {
  canvasSize: number;
  positions: T[];
  renderNode: (item: T, isLatest: boolean) => React.ReactNode;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ width: canvasSize, height: canvasSize }}>
          {positions.slice(1).map((pos, i) => (
            <ConnectorLine key={`line-${i}`} from={positions[i]} to={pos} />
          ))}
          {positions.map((pos, i) => renderNode(pos, i === positions.length - 1))}
        </View>
      </ScrollView>
    </ScrollView>
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

function NodeDetailSheet({
  node,
  focusBlock,
  onClose,
  onDelete,
  onStartFocus,
  onSetFocusStatus,
}: {
  node: MindMapNode;
  focusBlock?: FocusBlock;
  onClose: () => void;
  onDelete: () => void;
  onStartFocus: (node: MindMapNode) => Promise<{ ok: true } | { ok: false; message: string }>;
  onSetFocusStatus: (blockId: string, status: FocusBlockStatus) => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  function confirmDelete() {
    Alert.alert('Remove this insight', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onDelete },
    ]);
  }

  async function handleStart() {
    setDrafting(true);
    setDraftError(null);
    const result = await onStartFocus(node);
    setDrafting(false);
    if (!result.ok) setDraftError(result.message);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <Text style={styles.sheetLabel}>PINNED</Text>
        <Text style={styles.sheetDate}>{node.label}</Text>
        <Text style={styles.sheetOpponent}>
          {new Date(node.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>

        {focusBlock ? (
          <View style={styles.focusSection}>
            <Text style={styles.sheetLabel}>
              {focusBlock.status === 'active' ? 'ACTIVE FOCUS' : focusBlock.status === 'eased' ? 'FOCUS · EASED' : 'FOCUS · DROPPED'}
            </Text>
            {focusBlock.plan.map((line, i) => (
              <Text key={i} style={styles.sheetBody}>
                {'•'} {line}
              </Text>
            ))}
            {focusBlock.status === 'active' ? (
              <View style={styles.focusActions}>
                <Pressable
                  onPress={() => onSetFocusStatus(focusBlock.id, 'eased')}
                  accessibilityRole="button"
                  accessibilityLabel="Mark focus as eased">
                  <Text style={styles.focusActionText}>Mark as eased</Text>
                </Pressable>
                <Pressable
                  onPress={() => onSetFocusStatus(focusBlock.id, 'dropped')}
                  accessibilityRole="button"
                  accessibilityLabel="Drop this focus">
                  <Text style={styles.focusActionText}>Drop</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : drafting ? (
          <View style={styles.focusSection}>
            <ActivityIndicator color={CareerTheme.accent} />
          </View>
        ) : (
          <View style={styles.focusSection}>
            {draftError ? <Text style={styles.focusErrorText}>{draftError}</Text> : null}
            <Pressable
              onPress={handleStart}
              style={styles.startFocusButton}
              accessibilityRole="button"
              accessibilityLabel="Start training plan">
              <Text style={styles.startFocusButtonText}>Start training plan</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={confirmDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Remove this insight">
          <Text style={styles.deleteButtonText}>Remove this insight</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
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
              {turn.nodeOffer?.status === 'accepted' ? (
                <Text style={styles.sheetPinnedNote}>Pinned: {turn.nodeOffer.label}</Text>
              ) : null}
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
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  tab: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CareerTheme.border,
  },
  tabActive: {
    backgroundColor: CareerTheme.accentMuted,
    borderColor: CareerTheme.accent,
  },
  tabText: {
    color: CareerTheme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: CareerTheme.accent,
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
  nodeLabel: {
    color: CareerTheme.text,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  nodeLabelLatest: {
    color: CareerTheme.accentText,
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
  sheetPinnedNote: {
    color: CareerTheme.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing.two,
  },
  focusSection: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: CareerTheme.border,
    gap: Spacing.one,
  },
  focusActions: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
  focusActionText: {
    color: CareerTheme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  focusErrorText: {
    color: '#E5484D',
    fontSize: 13,
    marginBottom: Spacing.one,
  },
  startFocusButton: {
    borderWidth: 1,
    borderColor: CareerTheme.accent,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  startFocusButtonText: {
    color: CareerTheme.accent,
    fontSize: 14,
    fontWeight: '700',
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
