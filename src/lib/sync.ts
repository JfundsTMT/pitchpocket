import { loadDebriefHistory, replaceAllDebriefs, type DebriefRecord } from '@/lib/debrief-history';
import { loadFixtures, replaceAllFixtures, type Fixture } from '@/lib/fixtures';
import { loadPlayerProfile, restorePlayerProfile, type PlayerProfile } from '@/lib/player-profile';
import { supabase } from '@/lib/supabase';
import { onPushRequested } from '@/lib/sync-signal';
import { clearTombstones, loadTombstones } from '@/lib/sync-tombstones';

// Local-first sync. AsyncStorage stays the source of truth the UI reads —
// the network is never on the critical path of using the app. Records are
// immutable once created, which keeps merging honest: a sync round is
// "push everything local, soft-delete tombstoned ids, pull what's live,
// union by id." No clocks to compare, no edit conflicts to resolve.

type FixtureRow = {
  id: string;
  opponent: string;
  match_date: string;
  competition: string | null;
  created_at: string;
};

type DebriefRow = {
  id: string;
  fixture_id: string | null;
  transcript: string;
  echo_response: string;
  created_at: string;
};

let syncInFlight: Promise<{ changed: boolean }> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Wire the data layer's "something changed" signal to a debounced sync. */
export function initSync(): void {
  onPushRequested(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncNow().catch(() => undefined);
    }, 2000);
  });
}

/**
 * One full sync round. Never throws and never blocks the UI — every failure
 * path degrades to "still local-only, try again next time".
 */
export function syncNow(): Promise<{ changed: boolean }> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(): Promise<{ changed: boolean }> {
  if (!supabase) return { changed: false };
  try {
    const userId = await ensureSignedIn();
    if (!userId) return { changed: false };

    const [profile, localFixtures, localDebriefs, tombstones] = await Promise.all([
      loadPlayerProfile(),
      loadFixtures(),
      loadDebriefHistory(),
      loadTombstones(),
    ]);

    // 1. Tell the server about local deletes first, so the pull below
    //    can't re-import something the player just removed.
    if (tombstones.fixtures.length > 0) {
      const { error } = await supabase.from('fixtures').update({ deleted: true }).in('id', tombstones.fixtures);
      if (!error) await clearTombstones({ fixtures: tombstones.fixtures, debriefs: [] });
    }
    if (tombstones.debriefs.length > 0) {
      const { error } = await supabase.from('debriefs').update({ deleted: true }).in('id', tombstones.debriefs);
      if (!error) await clearTombstones({ fixtures: [], debriefs: tombstones.debriefs });
    }

    // 2. Push everything local. Volumes are tiny (a season is dozens of
    //    rows) so unconditional upsert beats change-tracking complexity.
    if (profile) {
      await supabase
        .from('player_profiles')
        .upsert({ user_id: userId, profile, updated_at: new Date().toISOString() });
    }
    if (localFixtures.length > 0) {
      await supabase.from('fixtures').upsert(
        localFixtures.map((f) => ({
          id: f.id,
          user_id: userId,
          opponent: f.opponent,
          match_date: f.date,
          competition: f.competition ?? null,
          created_at: f.createdAt,
        })),
      );
    }
    if (localDebriefs.length > 0) {
      await supabase.from('debriefs').upsert(
        localDebriefs.map((r) => ({
          id: r.id,
          user_id: userId,
          fixture_id: r.fixtureId ?? null,
          transcript: r.transcript,
          echo_response: r.echoResponse,
          created_at: r.createdAt,
        })),
      );
    }

    // 3. Pull what's live and union into local by id (local copy wins —
    //    records are immutable, so any difference is formatting).
    const [{ data: remoteFixtures }, { data: remoteDebriefs }] = await Promise.all([
      supabase.from('fixtures').select('id, opponent, match_date, competition, created_at').eq('deleted', false),
      supabase
        .from('debriefs')
        .select('id, fixture_id, transcript, echo_response, created_at')
        .eq('deleted', false),
    ]);

    let changed = false;
    if (remoteFixtures) {
      const merged = mergeById(localFixtures, (remoteFixtures as FixtureRow[]).map(fixtureFromRow));
      if (merged.length !== localFixtures.length) {
        await replaceAllFixtures(merged);
        changed = true;
      }
    }
    if (remoteDebriefs) {
      const merged = mergeById(localDebriefs, (remoteDebriefs as DebriefRow[]).map(debriefFromRow));
      if (merged.length !== localDebriefs.length) {
        await replaceAllDebriefs(merged);
        changed = true;
      }
    }
    return { changed };
  } catch (error) {
    console.warn('Sync failed, staying local-only for now', error);
    return { changed: false };
  }
}

/**
 * Pull the full career for the just-signed-in account. Used by the restore
 * flow; returns the remote profile so the caller can complete the
 * onboarding gate with it.
 */
export async function pullCareerAfterRestore(): Promise<PlayerProfile | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const [{ data: profileRow }, syncResult] = await Promise.all([
    supabase.from('player_profiles').select('profile').eq('user_id', userId).maybeSingle(),
    syncNow(),
  ]);
  void syncResult;

  const remoteProfile = (profileRow?.profile ?? null) as PlayerProfile | null;
  if (remoteProfile && remoteProfile.onboardingComplete) {
    const localProfile = await loadPlayerProfile();
    if (!localProfile) {
      await restorePlayerProfile(remoteProfile);
    }
    return remoteProfile;
  }
  return null;
}

async function ensureSignedIn(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn('Anonymous sign-in failed, staying local-only', error.message);
    return null;
  }
  return anon.session?.user.id ?? null;
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const record of remote) byId.set(record.id, record);
  for (const record of local) byId.set(record.id, record);
  return [...byId.values()];
}

function fixtureFromRow(row: FixtureRow): Fixture {
  return {
    id: row.id,
    opponent: row.opponent,
    date: row.match_date,
    competition: row.competition ?? undefined,
    createdAt: row.created_at,
  };
}

function debriefFromRow(row: DebriefRow): DebriefRecord {
  return {
    id: row.id,
    fixtureId: row.fixture_id ?? undefined,
    transcript: row.transcript,
    echoResponse: row.echo_response,
    createdAt: row.created_at,
  };
}
