import { router } from 'expo-router';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { resolvePlayerContext } from '@/features/debrief/resolve-player-context';
import { useTheme } from '@/hooks/use-theme';
import { addDebriefRecord, buildRecentDebriefContext, loadDebriefHistory, type PastDebrief } from '@/lib/debrief-history';
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

type ScreenState =
  | { phase: 'loading_profile' }
  | { phase: 'no_profile' }
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'transcribing'; fileUri: string }
  | { phase: 'transcribe_error'; fileUri: string; error: EchoApiError }
  | { phase: 'thinking'; transcript: string }
  | { phase: 'echo_error'; transcript: string; error: EchoApiError }
  | { phase: 'done'; transcript: string; echoResponse: string };

type DebriefScreenProps = {
  fixtureId?: string;
};

export function DebriefScreen({ fixtureId }: DebriefScreenProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [pastDebriefs, setPastDebriefs] = useState<PastDebrief[]>([]);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [state, setState] = useState<ScreenState>({ phase: 'loading_profile' });
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const autoStopFired = useRef(false);

  useEffect(() => {
    Promise.all([loadPlayerProfile(), loadDebriefHistory(), loadFixtures()]).then(
      ([loadedProfile, loadedHistory, loadedFixtures]) => {
        setProfile(loadedProfile);
        setPastDebriefs(buildRecentDebriefContext(loadedHistory));
        setFixture(fixtureId ? (loadedFixtures.find((f) => f.id === fixtureId) ?? null) : null);
        setState(loadedProfile ? { phase: 'idle' } : { phase: 'no_profile' });
      },
    );
  }, [fixtureId]);

  // Save the moment a debrief completes, so nothing is lost if the player
  // navigates away before reading — the "back to home" button is about
  // giving them time to read Echo's response, not gating the save on it.
  useEffect(() => {
    if (state.phase !== 'done') return;
    addDebriefRecord({ fixtureId, transcript: state.transcript, echoResponse: state.echoResponse });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

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
      setState({ phase: 'idle' });
      return;
    }
    await runTranscription(uri);
  }

  async function handleDiscardRecording() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    setState({ phase: 'idle' });
  }

  async function runTranscription(fileUri: string) {
    setState({ phase: 'transcribing', fileUri });
    const result = await transcribeAudio(fileUri);
    if (!result.ok) {
      setState({ phase: 'transcribe_error', fileUri, error: result.error });
      return;
    }
    // A silent or unintelligible recording produces a near-empty transcript —
    // catch it here instead of burning an Echo call on nothing.
    if (result.data.transcript.trim().length < 5) {
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
    await runEchoResponse(result.data.transcript);
  }

  async function runEchoResponse(transcript: string) {
    if (!profile) return;
    setState({ phase: 'thinking', transcript });
    const result = await getEchoResponse(transcript, resolvePlayerContext(profile), pastDebriefs);
    if (!result.ok) {
      setState({ phase: 'echo_error', transcript, error: result.error });
      return;
    }
    setState({ phase: 'done', transcript, echoResponse: result.data.echoResponse });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
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

          {renderBody(state, {
            onStart: handleStartRecording,
            onStop: handleStopRecording,
            onDiscard: handleDiscardRecording,
            onRetryTranscribe: () => runTranscription(state.phase === 'transcribe_error' ? state.fileUri : ''),
            onRetryEcho: () => runEchoResponse(state.phase === 'echo_error' ? state.transcript : ''),
            onReset: () => setState({ phase: 'idle' }),
            onDone: () => router.replace('/'),
            elapsedSeconds: recorderState.durationMillis ? Math.floor(recorderState.durationMillis / 1000) : 0,
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type BodyHandlers = {
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onRetryTranscribe: () => void;
  onRetryEcho: () => void;
  onReset: () => void;
  onDone: () => void;
  elapsedSeconds: number;
};

function renderBody(state: ScreenState, handlers: BodyHandlers) {
  switch (state.phase) {
    case 'loading_profile':
      return <ActivityIndicator />;
    case 'no_profile':
      return <ThemedText type="default">Complete onboarding first — no player profile found.</ThemedText>;
    case 'idle':
      return <PrimaryButton label="Start recording" onPress={handlers.onStart} />;
    case 'recording':
      return (
        <>
          <ThemedText type="default" style={styles.status}>
            Recording — {formatDuration(handlers.elapsedSeconds)}
          </ThemedText>
          {handlers.elapsedSeconds >= RECORDING_WARNING_SECONDS ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
              Getting long — auto-sends at 10:00 so nothing gets lost.
            </ThemedText>
          ) : null}
          <PrimaryButton label="Stop & send" onPress={handlers.onStop} />
          <Pressable
            onPress={handlers.onDiscard}
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
      return <ThemedText type="default">Transcribing your debrief…</ThemedText>;
    case 'transcribe_error':
      return (
        <ErrorState
          message={state.error.message}
          onRetry={state.fileUri ? handlers.onRetryTranscribe : undefined}
          onReset={handlers.onReset}
        />
      );
    case 'thinking':
      return (
        <>
          <ThemedText type="default" style={styles.status}>
            Echo is thinking…
          </ThemedText>
          <TranscriptBlock transcript={state.transcript} />
        </>
      );
    case 'echo_error':
      return (
        <>
          <ErrorState message={state.error.message} onRetry={handlers.onRetryEcho} onReset={handlers.onReset} />
          <TranscriptBlock transcript={state.transcript} />
        </>
      );
    case 'done':
      return (
        <>
          <ThemedView type="backgroundElement" style={styles.responseCard}>
            <ThemedText type="default">{state.echoResponse}</ThemedText>
          </ThemedView>
          <TranscriptBlock transcript={state.transcript} />
          <PrimaryButton label="Back to home" onPress={handlers.onDone} />
        </>
      );
    default:
      return null;
  }
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
        <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel="Start over">
          <ThemedText type="link">Start over</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function TranscriptBlock({ transcript }: { transcript: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.transcriptCard}>
      <ThemedText type="small" themeColor="textSecondary">
        TRANSCRIPT
      </ThemedText>
      <ThemedText type="small" style={styles.transcriptText}>
        {transcript}
      </ThemedText>
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
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
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
