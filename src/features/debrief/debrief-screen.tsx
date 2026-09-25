import { router } from 'expo-router';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioWaveform } from '@/components/audio-waveform';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ECHO_THINKING_PHRASES, FOCUS_PLAN_PHRASES, TRANSCRIBING_PHRASES } from '@/constants/loading-phrases';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useLoadingPhrase } from '@/hooks/use-loading-phrase';
import { useTheme } from '@/hooks/use-theme';
import {
  appendDebriefTurn,
  buildRecentDebriefContext,
  createDebriefRecord,
  loadDebriefHistory,
  saveDebriefSummary,
  setNodeOfferStatus,
  type DebriefTurn,
  type NodeOffer,
} from '@/lib/debrief-history';
import { draftFocusPlan, getEchoResponse, summarizeDebrief, transcribeAudio, updateMemory, type EchoApiError } from '@/lib/echo-api';
import { createFocusBlock } from '@/lib/focus-blocks';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
import { createMindMapNode } from '@/lib/mind-map-nodes';
import { loadPlayerMemory, savePlayerMemory } from '@/lib/player-memory';
import { loadPlayerProfile, type PlayerProfile } from '@/lib/player-profile';

// Soft warning threshold shown in the UI. The real limit is enforced
// server-side (see server/api/transcribe.ts MAX_AUDIO_BYTES) — recordings
// past this point risk exceeding Vercel's 4.5MB request body cap once
// base64-encoded, which surfaces as a clear "audio_too_large" retry state.
const RECORDING_WARNING_SECONDS = 5 * 60;
// Hard stop before the upload is guaranteed to be rejected — losing a long
// debrief to a 413 after the fact is worse than cutting it off with warning.
const RECORDING_HARD_STOP_SECONDS = 10 * 60;

// One composer for both input methods: typing and voice both land in the
// same editable box. Voice transcription appends into it rather than
// sending straight away, so a mis-heard word can be fixed before it goes
// to Echo. There's no separate "choose speech or text" step — both are
// just always available from the same screen.
type ScreenState =
  | { phase: 'loading_profile' }
  | { phase: 'no_profile' }
  | { phase: 'composing' }
  | { phase: 'recording' }
  | { phase: 'transcribing'; fileUri: string }
  | { phase: 'transcribe_error'; fileUri: string; error: EchoApiError }
  | { phase: 'thinking'; pendingTranscript: string }
  | { phase: 'echo_error'; pendingTranscript: string; error: EchoApiError }
  | { phase: 'done' };

type DebriefScreenProps = {
  fixtureId?: string;
};

// A second, separate commitment beyond pinning a node — pinning means "this
// is real," starting a focus block means "I'm actively going to work on
// it." Keyed by turn index; only exists in-session (not persisted on the
// turn itself) since the FocusBlock record it produces is the real artifact.
type FocusPromptState =
  | { phase: 'offering'; nodeId: string }
  | { phase: 'drafting'; nodeId: string }
  | { phase: 'error'; nodeId: string; message: string }
  | { phase: 'started'; plan: string[] }
  | { phase: 'skipped' };

export function DebriefScreen({ fixtureId }: DebriefScreenProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [memoryFacts, setMemoryFacts] = useState<string[]>([]);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [turns, setTurns] = useState<DebriefTurn[]>([]);
  const [focusPrompts, setFocusPrompts] = useState<Record<number, FocusPromptState>>({});
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<ScreenState>({ phase: 'loading_profile' });
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const autoStopFired = useRef(false);
  // The persisted record for this conversation — null until the first
  // exchange completes, then every reply appends to the same record instead
  // of creating a new one.
  const recordId = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([loadPlayerProfile(), loadFixtures(), loadPlayerMemory()]).then(
      ([loadedProfile, loadedFixtures, loadedMemory]) => {
        setProfile(loadedProfile);
        setMemoryFacts(loadedMemory.facts.map((f) => f.text));
        setFixture(fixtureId ? (loadedFixtures.find((f) => f.id === fixtureId) ?? null) : null);
        setState(loadedProfile ? { phase: 'composing' } : { phase: 'no_profile' });
      },
    );
  }, [fixtureId]);

  // Save the moment each exchange completes, so nothing is lost if the
  // player navigates away mid-conversation — the first exchange creates the
  // record, every reply after that appends a turn to it. Then regenerate
  // the running summary+signals from the full conversation so far — fire
  // and forget, never blocking the UI, since a missing summary just falls
  // back to raw transcript elsewhere (see buildRecentDebriefContext).
  useEffect(() => {
    if (state.phase !== 'done' || turns.length === 0) return;
    const latestTurn = turns[turns.length - 1];
    const allTurnsSoFar = turns;

    async function persistAndSummarize() {
      let id = recordId.current;
      if (!id) {
        const record = await createDebriefRecord({ fixtureId, ...latestTurn });
        id = record.id;
        recordId.current = id;
      } else {
        await appendDebriefTurn(id, latestTurn);
      }
      if (!profile) return;
      const result = await summarizeDebrief(allTurnsSoFar, resolvePlayerContext(profile));
      if (result.ok) {
        await saveDebriefSummary(id, { text: result.data.summary, signals: result.data.signals });
      }
    }

    persistAndSummarize().catch((error) => console.warn('Debrief save/summarize failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, state.phase]);

  // Hard auto-stop: past this point the upload would be rejected anyway, so
  // send what we have rather than letting the player lose the whole debrief.
  // The ref guards against re-entry while the async stop is in flight.
  useEffect(() => {
    const elapsed = recorderState.durationMillis ? recorderState.durationMillis / 1000 : 0;
    if (state.phase === 'recording' && elapsed >= RECORDING_HARD_STOP_SECONDS && !autoStopFired.current) {
      autoStopFired.current = true;
      handleStopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, recorderState.durationMillis]);

  async function handleStartRecording() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setState({
        phase: 'transcribe_error',
        fileUri: '',
        error: { kind: 'server_error', message: 'Mic permission denied. Enable it in Settings to record a debrief.' },
      });
      return;
    }
    // iOS rejects allowsRecording without playsInSilentMode also enabled —
    // .playAndRecord requires both together, whatever the documented default.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    autoStopFired.current = false;
    recorder.record();
    setState({ phase: 'recording' });
  }

  async function handleStopRecording() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri) {
      setState({ phase: 'composing' });
      return;
    }
    await runTranscription(uri);
  }

  async function handleDiscardRecording() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    setState({ phase: 'composing' });
  }

  async function runTranscription(fileUri: string) {
    setState({ phase: 'transcribing', fileUri });
    const result = await transcribeAudio(fileUri);
    if (!result.ok) {
      setState({ phase: 'transcribe_error', fileUri, error: result.error });
      return;
    }
    const heard = result.data.transcript.trim();
    // A silent or unintelligible recording produces a near-empty transcript.
    // If there's nothing typed already either, that's worth telling the
    // player rather than silently returning to an empty box.
    if (heard.length < 5) {
      if (draft.trim().length === 0) {
        setState({
          phase: 'transcribe_error',
          fileUri,
          error: {
            kind: 'server_error',
            message: "Couldn't hear anything in that recording — try again a bit closer to the mic.",
          },
        });
        return;
      }
      setState({ phase: 'composing' });
      return;
    }
    setDraft((current) => (current.trim().length > 0 ? `${current.trim()} ${heard}` : heard));
    setState({ phase: 'composing' });
  }

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    runEchoResponse(text);
  }

  async function runEchoResponse(pendingTranscript: string) {
    if (!profile) return;
    setState({ phase: 'thinking', pendingTranscript });
    const result = await getEchoResponse(turns, pendingTranscript, resolvePlayerContext(profile), memoryFacts);
    if (!result.ok) {
      setState({ phase: 'echo_error', pendingTranscript, error: result.error });
      return;
    }
    const nodeOffer: NodeOffer | undefined = result.data.nodeOffer
      ? { label: result.data.nodeOffer.label, status: 'pending' }
      : undefined;
    setTurns((current) => [
      ...current,
      { transcript: pendingTranscript, echoResponse: result.data.echoResponse, nodeOffer },
    ]);
    setState({ phase: 'done' });
  }

  // The player accepting/declining Echo's offer to pin a discovery. Best
  // effort on the debrief-record link: if the record hasn't finished being
  // created yet (a narrow race right after the very first turn), the node
  // still gets pinned, just without that backlink.
  async function handlePinNode(turnIndex: number) {
    const turn = turns[turnIndex];
    if (!turn?.nodeOffer) return;
    const node = await createMindMapNode({ label: turn.nodeOffer.label, debriefId: recordId.current ?? undefined });
    if (recordId.current) {
      await setNodeOfferStatus(recordId.current, turnIndex, 'accepted');
    }
    setTurns((current) =>
      current.map((t, i) => (i === turnIndex && t.nodeOffer ? { ...t, nodeOffer: { ...t.nodeOffer, status: 'accepted' } } : t)),
    );
    setFocusPrompts((current) => ({ ...current, [turnIndex]: { phase: 'offering', nodeId: node.id } }));
  }

  async function handleSkipNode(turnIndex: number) {
    const turn = turns[turnIndex];
    if (!turn?.nodeOffer || !recordId.current) return;
    await setNodeOfferStatus(recordId.current, turnIndex, 'declined');
    setTurns((current) =>
      current.map((t, i) => (i === turnIndex && t.nodeOffer ? { ...t, nodeOffer: { ...t.nodeOffer, status: 'declined' } } : t)),
    );
  }

  // The player's second, separate commit: drafting and saving an actual
  // focus block from the insight they already pinned. Errors surface
  // in-place with a retry — this is a real network call, same bar as the
  // rest of the debrief pipeline.
  async function handleStartFocusBlock(turnIndex: number) {
    const promptState = focusPrompts[turnIndex];
    const turn = turns[turnIndex];
    if (!promptState || (promptState.phase !== 'offering' && promptState.phase !== 'error') || !turn?.nodeOffer || !profile) {
      return;
    }
    const { nodeId } = promptState;
    setFocusPrompts((current) => ({ ...current, [turnIndex]: { phase: 'drafting', nodeId } }));
    const result = await draftFocusPlan(resolvePlayerContext(profile), turn.nodeOffer.label, {
      transcript: turn.transcript,
      echoResponse: turn.echoResponse,
    });
    if (!result.ok || result.data.plan.length === 0) {
      setFocusPrompts((current) => ({
        ...current,
        [turnIndex]: {
          phase: 'error',
          nodeId,
          message: result.ok ? "Couldn't draft a plan from that — try again?" : result.error.message,
        },
      }));
      return;
    }
    await createFocusBlock({ nodeId, label: turn.nodeOffer.label, plan: result.data.plan });
    setFocusPrompts((current) => ({ ...current, [turnIndex]: { phase: 'started', plan: result.data.plan } }));
  }

  function handleSkipFocusBlock(turnIndex: number) {
    setFocusPrompts((current) => ({ ...current, [turnIndex]: { phase: 'skipped' } }));
  }

  // Never on the critical path — navigate away immediately, regenerate
  // memory in the background. A step-back synthesis over recent history
  // (see update-memory.ts), done once at the close of a debrief rather
  // than every turn, so it needs the freshest history, not the mount-time
  // snapshot this session started with.
  function handleFinishDebrief() {
    if (profile) {
      regenerateMemory(profile).catch((error) => console.warn('Memory update failed', error));
    }
    router.replace('/');
  }

  async function regenerateMemory(currentProfile: PlayerProfile) {
    const [freshHistory, currentMemory] = await Promise.all([loadDebriefHistory(), loadPlayerMemory()]);
    const recentDebriefs = buildRecentDebriefContext(freshHistory);
    const existingFacts = currentMemory.facts.map((f) => f.text);
    const result = await updateMemory(resolvePlayerContext(currentProfile), existingFacts, recentDebriefs);
    if (result.ok) {
      await savePlayerMemory(result.data.facts);
    }
  }

  const hideHeaderBack = state.phase === 'recording' || state.phase === 'transcribing' || state.phase === 'thinking';
  const transcribingPhrase = useLoadingPhrase(state.phase === 'transcribing', TRANSCRIBING_PHRASES);
  const thinkingPhrase = useLoadingPhrase(state.phase === 'thinking', ECHO_THINKING_PHRASES);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Debrief with Echo" hideBack={hideHeaderBack} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.select({ ios: 12, default: 0 })}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {fixture ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.fixtureContext}>
                vs {fixture.opponent} — {formatFixtureDate(fixture.date)}
              </ThemedText>
            ) : null}

            {turns.length > 0 ? (
              <ConversationThread
                turns={turns}
                focusPrompts={focusPrompts}
                onPinNode={handlePinNode}
                onSkipNode={handleSkipNode}
                onStartFocus={handleStartFocusBlock}
                onSkipFocus={handleSkipFocusBlock}
              />
            ) : null}

            {renderBody(state, {
              draft,
              onChangeDraft: setDraft,
              onStartRecording: handleStartRecording,
              onStopRecording: handleStopRecording,
              onDiscardRecording: handleDiscardRecording,
              onSend: handleSend,
              onRetryTranscribe: () => runTranscription(state.phase === 'transcribe_error' ? state.fileUri : ''),
              onRetryEcho: () => runEchoResponse(state.phase === 'echo_error' ? state.pendingTranscript : ''),
              onDismissError: () => setState({ phase: 'composing' }),
              onDone: handleFinishDebrief,
              elapsedSeconds: recorderState.durationMillis ? Math.floor(recorderState.durationMillis / 1000) : 0,
              meteringDb: recorderState.metering,
              transcribingPhrase,
              thinkingPhrase,
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

type BodyHandlers = {
  draft: string;
  onChangeDraft: (text: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDiscardRecording: () => void;
  onSend: () => void;
  onRetryTranscribe: () => void;
  onRetryEcho: () => void;
  onDismissError: () => void;
  onDone: () => void;
  elapsedSeconds: number;
  meteringDb: number | undefined;
  transcribingPhrase: string;
  thinkingPhrase: string;
};

function renderBody(state: ScreenState, handlers: BodyHandlers) {
  switch (state.phase) {
    case 'loading_profile':
      return <ActivityIndicator />;
    case 'no_profile':
      return <ThemedText type="default">Complete onboarding first — no player profile found.</ThemedText>;
    case 'composing':
      return <Composer {...handlers} />;
    case 'recording':
      return (
        <>
          {handlers.draft.trim().length > 0 ? (
            <ThemedView type="backgroundElement" style={styles.draftPreview}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                {handlers.draft}
              </ThemedText>
            </ThemedView>
          ) : null}
          <ThemedText type="default" style={styles.status}>
            Recording — {formatDuration(handlers.elapsedSeconds)}
          </ThemedText>
          <AudioWaveform metering={handlers.meteringDb} active />
          {handlers.elapsedSeconds >= RECORDING_WARNING_SECONDS ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
              Getting long — auto-sends at 10:00 so nothing gets lost.
            </ThemedText>
          ) : null}
          <PrimaryButton label="Stop" onPress={handlers.onStopRecording} />
          <Pressable
            onPress={handlers.onDiscardRecording}
            style={styles.discardLink}
            accessibilityRole="button"
            accessibilityLabel="Discard recording">
            <ThemedText type="small" themeColor="textSecondary">
              Discard
            </ThemedText>
          </Pressable>
        </>
      );
    case 'transcribing':
      return <ThemedText type="default">{handlers.transcribingPhrase}</ThemedText>;
    case 'transcribe_error':
      return (
        <ErrorState
          message={state.error.message}
          onRetry={state.fileUri ? handlers.onRetryTranscribe : undefined}
          onReset={handlers.onDismissError}
        />
      );
    case 'thinking':
      return (
        <ThemedText type="default" style={styles.status}>
          {handlers.thinkingPhrase}
        </ThemedText>
      );
    case 'echo_error':
      return <ErrorState message={state.error.message} onRetry={handlers.onRetryEcho} onReset={handlers.onDismissError} />;
    case 'done':
      return (
        <>
          <Composer {...handlers} />
          <Pressable
            onPress={handlers.onDone}
            style={styles.finishLink}
            accessibilityRole="button"
            accessibilityLabel="Finish debrief">
            <ThemedText type="link">Finish & back to home</ThemedText>
          </Pressable>
        </>
      );
    default:
      return null;
  }
}

function Composer({ draft, onChangeDraft, onStartRecording, onSend }: BodyHandlers) {
  const theme = useTheme();
  const canSend = draft.trim().length > 0;
  return (
    <ThemedView type="backgroundElement" style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={onChangeDraft}
        placeholder="Type your debrief, or tap the mic to speak it…"
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.composerInput, { color: theme.text }]}
        accessibilityLabel="Debrief message"
      />
      <ThemedView style={styles.composerActions}>
        <Pressable
          onPress={onStartRecording}
          style={[styles.micButton, { borderColor: theme.text }]}
          accessibilityRole="button"
          accessibilityLabel="Record voice message">
          <ThemedText type="smallBold">Mic</ThemedText>
        </Pressable>
        <PrimaryButton label="Send" onPress={onSend} disabled={!canSend} style={styles.sendButton} />
      </ThemedView>
    </ThemedView>
  );
}

function ConversationThread({
  turns,
  focusPrompts,
  onPinNode,
  onSkipNode,
  onStartFocus,
  onSkipFocus,
}: {
  turns: DebriefTurn[];
  focusPrompts: Record<number, FocusPromptState>;
  onPinNode: (turnIndex: number) => void;
  onSkipNode: (turnIndex: number) => void;
  onStartFocus: (turnIndex: number) => void;
  onSkipFocus: (turnIndex: number) => void;
}) {
  return (
    <ThemedView style={styles.thread}>
      {turns.map((turn, index) => (
        <ThemedView key={index} style={styles.threadTurn}>
          <ThemedView type="backgroundElement" style={styles.transcriptCard}>
            <ThemedText type="small" themeColor="textSecondary">
              YOU
            </ThemedText>
            <ThemedText type="small" style={styles.transcriptText}>
              {turn.transcript}
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.responseCard}>
            <ThemedText type="small" themeColor="textSecondary">
              ECHO
            </ThemedText>
            <ThemedText type="default">{turn.echoResponse}</ThemedText>
          </ThemedView>
          {turn.nodeOffer?.status === 'pending' ? (
            <NodeOfferPrompt
              offer={turn.nodeOffer}
              onPin={() => onPinNode(index)}
              onSkip={() => onSkipNode(index)}
            />
          ) : turn.nodeOffer?.status === 'accepted' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.pinnedLabel}>
                Pinned to your mind map
              </ThemedText>
              {focusPrompts[index] ? (
                <FocusBlockPrompt
                  state={focusPrompts[index]}
                  onStart={() => onStartFocus(index)}
                  onSkip={() => onSkipFocus(index)}
                />
              ) : null}
            </>
          ) : null}
        </ThemedView>
      ))}
    </ThemedView>
  );
}

function FocusBlockPrompt({
  state,
  onStart,
  onSkip,
}: {
  state: FocusPromptState;
  onStart: () => void;
  onSkip: () => void;
}) {
  const draftingPhrase = useLoadingPhrase(state.phase === 'drafting', FOCUS_PLAN_PHRASES);

  if (state.phase === 'skipped') return null;

  if (state.phase === 'drafting') {
    return (
      <ThemedView type="backgroundElement" style={styles.focusCard}>
        <ActivityIndicator />
        <ThemedText type="small" themeColor="textSecondary">
          {draftingPhrase}
        </ThemedText>
      </ThemedView>
    );
  }

  if (state.phase === 'started') {
    return (
      <ThemedView type="backgroundSelected" style={styles.focusCard}>
        <ThemedText type="smallBold">Added to your focus</ThemedText>
        {state.plan.map((line, i) => (
          <ThemedText key={i} type="small" style={styles.focusLine}>
            {'•'} {line}
          </ThemedText>
        ))}
      </ThemedView>
    );
  }

  if (state.phase === 'error') {
    return (
      <ThemedView type="backgroundElement" style={styles.focusCard}>
        <ThemedText type="small">{state.message}</ThemedText>
        <Pressable onPress={onStart} accessibilityRole="button" accessibilityLabel="Retry drafting focus plan">
          <ThemedText type="link">Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.focusCard}>
      <ThemedText type="small">Want to actively train on this?</ThemedText>
      <ThemedView style={styles.nodeOfferActions}>
        <PrimaryButton label="Start focus" onPress={onStart} style={styles.pinButton} />
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Not now">
          <ThemedText type="link">Not now</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function NodeOfferPrompt({ offer, onPin, onSkip }: { offer: NodeOffer; onPin: () => void; onSkip: () => void }) {
  return (
    <ThemedView type="backgroundSelected" style={styles.nodeOfferCard}>
      <ThemedText type="smallBold">Pin this: {offer.label}</ThemedText>
      <ThemedView style={styles.nodeOfferActions}>
        <PrimaryButton label="Pin it" onPress={onPin} style={styles.pinButton} />
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip this insight">
          <ThemedText type="link">Not now</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function ErrorState({ message, onRetry, onReset }: { message: string; onRetry?: () => void; onReset: () => void }) {
  return (
    <ThemedView type="backgroundElement" style={styles.errorCard}>
      <ThemedText type="default">{message}</ThemedText>
      <ThemedView style={styles.errorActions}>
        {onRetry ? <PrimaryButton label="Retry" onPress={onRetry} /> : null}
        <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel="Dismiss">
          <ThemedText type="link">Dismiss</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFixtureDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  fixtureContext: {
    marginBottom: Spacing.one,
  },
  status: {
    marginBottom: Spacing.one,
  },
  discardLink: {
    alignItems: 'center',
    padding: Spacing.two,
  },
  finishLink: {
    alignItems: 'center',
    padding: Spacing.two,
  },
  composer: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  composerInput: {
    minHeight: 90,
    maxHeight: 220,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  micButton: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftPreview: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  thread: {
    gap: Spacing.three,
  },
  threadTurn: {
    gap: Spacing.two,
  },
  responseCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  errorCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  transcriptCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  transcriptText: {
    lineHeight: 20,
  },
  nodeOfferCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  nodeOfferActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pinButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  pinnedLabel: {
    fontStyle: 'italic',
  },
  focusCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  focusLine: {
    lineHeight: 20,
  },
});
