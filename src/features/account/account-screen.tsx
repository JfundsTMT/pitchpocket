import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CareerTheme } from '@/constants/career-theme';
import { Spacing } from '@/constants/theme';
import { useOnboardingGate } from '@/features/onboarding/onboarding-gate';
import { clearAllDebriefs } from '@/lib/debrief-history';
import { clearAllFixtures } from '@/lib/fixtures';
import { clearAllMindMapNodes } from '@/lib/mind-map-nodes';
import { isSyncConfigured, supabase } from '@/lib/supabase';
import { clearAllTombstones } from '@/lib/sync-tombstones';
import { pullCareerAfterRestore, syncNow } from '@/lib/sync';

type Mode =
  | 'status'
  | 'attach_email'
  | 'attach_code'
  | 'restore_email'
  | 'restore_code';

export function AccountScreen() {
  const { status: gateStatus, completeOnboarding } = useOnboardingGate();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [mode, setMode] = useState<Mode>('status');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false);
      return;
    }
    // Kick a sync so first-time visitors get their anonymous identity, then
    // read whatever session we ended up with.
    syncNow()
      .catch(() => undefined)
      .then(() => supabase!.auth.getSession())
      .then((result) => {
        const session = result?.data.session ?? null;
        setHasSession(Boolean(session));
        setUserEmail(session?.user.email ?? null);
        setSessionLoading(false);
      });
  }, []);

  // Same-phone restore: the player reset/lost their local career but the
  // Supabase session survived (it lives outside the profile storage), so no
  // email round-trip is needed — just pull and rehydrate.
  async function restoreWithExistingSession() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const profile = await pullCareerAfterRestore();
    setBusy(false);
    if (profile) {
      await completeOnboarding(profile);
      router.replace('/');
      return;
    }
    setError('No saved career found on this account yet.');
  }

  async function beginAttach() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice(`We sent a code to ${email.trim()}.`);
    setMode('attach_code');
  }

  async function confirmAttach() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setUserEmail(email.trim());
    setNotice('Career secured — you can now restore it on any phone.');
    setMode('status');
    setCode('');
  }

  async function beginRestore() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError) {
      setError(
        otpError.message.toLowerCase().includes('signup')
          ? 'No career found under that email.'
          : otpError.message,
      );
      return;
    }
    setNotice(`We sent a code to ${email.trim()}.`);
    setMode('restore_code');
  }

  async function confirmRestore() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (verifyError) {
      setBusy(false);
      setError(verifyError.message);
      return;
    }
    // Signing into an account replaces whatever career is on this phone —
    // otherwise the local leftovers would union-push into the restored
    // account on the next sync.
    await Promise.all([clearAllFixtures(), clearAllDebriefs(), clearAllMindMapNodes(), clearAllTombstones()]);
    const profile = await pullCareerAfterRestore();
    setBusy(false);
    if (profile) {
      if (gateStatus !== 'complete') {
        await completeOnboarding(profile);
      }
      router.replace('/');
      return;
    }
    setError('Signed in, but no saved career was found on that account.');
    setMode('status');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backLink}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Account & Backup</Text>

          {!isSyncConfigured ? (
            <Text style={styles.body}>
              Cloud backup isn’t configured in this build — your career is saved on this phone only.
            </Text>
          ) : sessionLoading ? (
            <ActivityIndicator color={CareerTheme.accent} />
          ) : (
            <>
              <View style={styles.statusCard}>
                <Text style={styles.statusHeadline}>
                  {userEmail ? 'CAREER SECURED' : hasSession ? 'BACKED UP' : 'LOCAL ONLY'}
                </Text>
                <Text style={styles.body}>
                  {userEmail
                    ? `Your career is backed up and recoverable with ${userEmail}.`
                    : hasSession
                      ? 'Your career is backed up to the cloud, but only this phone can reach it. Add your email so you can restore it on any phone.'
                      : 'Couldn’t reach the cloud right now — your career is safe on this phone and will back up automatically when you’re back online.'}
                </Text>
              </View>

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {mode === 'status' && gateStatus !== 'complete' && hasSession ? (
                <Pressable
                  onPress={restoreWithExistingSession}
                  disabled={busy}
                  style={[styles.primaryButton, { opacity: busy ? 0.4 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Restore this career">
                  <Text style={styles.primaryButtonText}>{busy ? 'RESTORING…' : 'RESTORE THIS CAREER'}</Text>
                </Pressable>
              ) : null}

              {mode === 'status' && !userEmail && hasSession ? (
                <Pressable
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setMode('attach_email');
                  }}
                  style={styles.primaryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Add your email">
                  <Text style={styles.primaryButtonText}>ADD YOUR EMAIL</Text>
                </Pressable>
              ) : null}

              {mode === 'attach_email' || mode === 'restore_email' ? (
                <>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={CareerTheme.textMuted}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    style={styles.input}
                    accessibilityLabel="Email address"
                  />
                  <Pressable
                    onPress={mode === 'attach_email' ? beginAttach : beginRestore}
                    disabled={busy || !email.includes('@')}
                    style={[styles.primaryButton, { opacity: busy || !email.includes('@') ? 0.4 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Send code">
                    <Text style={styles.primaryButtonText}>{busy ? 'SENDING…' : 'SEND CODE'}</Text>
                  </Pressable>
                </>
              ) : null}

              {mode === 'attach_code' || mode === 'restore_code' ? (
                <>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    placeholder="Code from the email"
                    placeholderTextColor={CareerTheme.textMuted}
                    keyboardType="number-pad"
                    maxLength={10}
                    style={styles.input}
                    accessibilityLabel="Verification code"
                  />
                  <Pressable
                    onPress={mode === 'attach_code' ? confirmAttach : confirmRestore}
                    disabled={busy || code.trim().length < 6}
                    style={[styles.primaryButton, { opacity: busy || code.trim().length < 6 ? 0.4 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm code">
                    <Text style={styles.primaryButtonText}>{busy ? 'CHECKING…' : 'CONFIRM'}</Text>
                  </Pressable>
                </>
              ) : null}

              {mode !== 'status' ? (
                <Pressable
                  onPress={() => {
                    setMode('status');
                    setError(null);
                    setNotice(null);
                    setCode('');
                  }}
                  style={styles.ghostLink}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel">
                  <Text style={styles.ghostLinkText}>Cancel</Text>
                </Pressable>
              ) : null}

              {mode === 'status' ? (
                <Pressable
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setMode('restore_email');
                  }}
                  style={styles.ghostLink}
                  accessibilityRole="button"
                  accessibilityLabel="Restore a career by email">
                  <Text style={styles.ghostLinkText}>
                    {userEmail
                      ? 'Sign into a different account'
                      : 'Already have a career on another phone? Restore it'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CareerTheme.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
  },
  title: {
    color: CareerTheme.text,
    fontSize: 28,
    fontWeight: '800',
  },
  statusCard: {
    backgroundColor: CareerTheme.surface,
    borderLeftWidth: 4,
    borderLeftColor: CareerTheme.accent,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statusHeadline: {
    color: CareerTheme.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  body: {
    color: CareerTheme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    color: CareerTheme.accent,
    fontSize: 13,
  },
  error: {
    color: '#E5484D',
    fontSize: 13,
  },
  input: {
    backgroundColor: CareerTheme.surface,
    borderRadius: 8,
    padding: Spacing.three,
    color: CareerTheme.text,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: CareerTheme.accent,
    borderRadius: 8,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: CareerTheme.accentText,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  ghostLink: {
    alignItems: 'center',
    padding: Spacing.two,
  },
  ghostLinkText: {
    color: CareerTheme.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
