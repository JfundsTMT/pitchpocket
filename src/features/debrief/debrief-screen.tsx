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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useTheme } from '@/hooks/use-theme';
import {
  appendDebriefTurn,
  buildRecentDebriefContext,
  createDebriefRecord,
  loadDebriefHistory,
  type DebriefTurn,
  type PastDebrief,
} from '@/lib/debrief-history';
import { getEchoResponse, transcribeAudio, type EchoApiError } from '@/lib/echo-api';
import { loadFixtures, type Fixture } from '@/lib/fixtures';
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

export function DebriefScreen({ fixtureId }: DebriefScreenProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [pastDebriefs, setPastDebriefs] = useState<PastDebrief[]>([]);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [turns, setTurns] = useState<DebriefTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<ScreenState>({ phase: 'loading_profile' });
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const autoStopFired = useRef(false);
  // The persisted record for this conversation — null until the first
  // exchange completes, then every reply appends to the same record instead
  // of creating a new one.
  const recordId = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([loadPlayerProfile(), loadDebriefHistory(), loadFixtures()]).then(
      ([loadedProfile, loadedHistory, loadedFixtures]) => {
        setProfile(loadedProfile);
        setPastDebriefs(buildRecentDebriefContext(loadedHistory));
        setFixture(fixtureId ? (loadedFixtures.find((f) => f.id === fixtureId) ?? null) : null);
        setState(loadedProfile ? { phase: 'composing' } : { phase: 'no_profile' });
      },
    );
  }, [fixtureId]);

  // Save the moment each exchange completes, so nothing is lost if the
  // player navigates away mid-conversation — the first exchange creates the
  // record, every reply after that appends a turn to it.
  useEffect(() => {
    if (state.phase !== 'done' || turns.length === 0) return;
    const latestTurn = turns[turns.length - 1];
    if (!recordId.current) {
      createDebriefRecord({ fixtureId, ...latestTurn }).then((record) => {
        recordId.current = record.id;
      });
    } else {
      appendDebriefTurn(recordId.current, latestTurn);
    }
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
    const result = await getEchoResponse(turns, pendingTranscript, resolvePlayerContext(profile), pastDebriefs);
    if (!result.ok) {
      setState({ phase: 'echo_error', pendingTranscript, error: result.error });
      return;
    }
    setTurns((current) => [...current, { transcript: pendingTranscript, echoResponse: result.data.echoResponse }]);
    setState({ phase: 'done' });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.select({ ios: 12, default: 0 })}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {state.phase !== 'recording' && state.phase !== 'transcribing' && state.phase !== 'thinking' ? (
              <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={styles.backLink}
                accessibilityRole="button"
                accessibilityLabel="Back">
                <ThemedText type="small" themeColor="textSecondary">
                  ‹ Back
                </ThemedText>
              </Pressable>
            ) : null}
            <ThemedText type="title" style={styles.title}>
              Debrief with Echo
            </ThemedText>
            {fixture ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.fixtureContext}>
                vs {fixture.opponent} — {formatFixtureDate(fixture.date)}
              </ThemedText>
            ) : null}

            {turns.length > 0 ? <ConversationThread turns={turns} /> : null}

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
              onDone: () => router.replace('/'),
              elapsedSeconds: recorderState.durationMillis ? Math.floor(recorderState.durationMillis / 1000) : 0,
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
      return <ThemedText type="default">Transcribing…</ThemedText>;
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
          Echo is thinking…
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
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendButton, { backgroundColor: theme.text, opacity: canSend ? 1 : 0.3 }]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}>
          <ThemedText type="smallBold" themeColor="background">
            Send
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function ConversationThread({ turns }: { turns: DebriefTurn[] }) {
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
        </ThemedView>
      ))}
    </ThemedView>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.primaryButton, { backgroundColor: theme.text }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <ThemedText type="smallBold" themeColor="background">
        {label}
      </ThemedText>
    </Pressable>
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
  title: {
    marginBottom: Spacing.two,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  fixtureContext: {
    marginTop: -Spacing.two,
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
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
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
});
