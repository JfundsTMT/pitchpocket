# PitchPocket

Career mode engine for real football players — FM/FIFA career mode, but the player is the save file and the career is their actual life. See `CLAUDE.md` for the product spec and build order.

## Stack

- **App**: React Native + Expo (SDK 54), TypeScript strict, Expo Router (file-based routing in `src/app`), React Compiler enabled. Local persistence via AsyncStorage (`src/lib`).
- **Server**: Vercel serverless functions in `server/` — `/api/transcribe` (OpenAI speech-to-text) and `/api/debrief-response` (Anthropic, Echo's replies). Deploys automatically on push via Vercel's GitHub integration (Root Directory: `server`).

## Get started

```bash
npm install
npx expo start --tunnel   # scan/open in Expo Go on a phone
```

Testing happens in stock **Expo Go** (SDK 54 — the App Store build lags newer SDKs). A custom dev build only becomes necessary at stage 8 (HealthKit / Health Connect).

Server env vars (set in Vercel, not committed): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_CHAT_MODEL` (defaults to `claude-opus-4-8`). See `server/.env.local.example`.

Client env: `EXPO_PUBLIC_ECHO_API_BASE_URL` (defaults to the production Vercel URL).

## Cloud backup (Supabase)

The career (profile, fixtures, debriefs) is local-first in AsyncStorage; Supabase adds backup and cross-device recovery on top. The app signs players in anonymously on first sync, and they can optionally attach an email later (6-digit code) to make the career recoverable on a new phone — accounts never gate the core loop.

- Schema + Row Level Security policies: `supabase/schema.sql` (run once in the Supabase SQL Editor). RLS scopes every row to its owner, which is what makes talking to Supabase directly from the client with the anon key safe.
- Anonymous sign-ins must be enabled: Dashboard → Authentication → Sign In / Up → Anonymous.
- Client env (copy `.env.example` to `.env`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Without them, sync silently disables and the app runs local-only.
- Sync design (`src/lib/sync.ts`): records are immutable once created, so a sync round is push-all → soft-delete tombstoned ids → pull-live → union by id. Deletes use local tombstones so an offline delete can't be resurrected by a later pull.

## Checks

```bash
npx tsc --noEmit   # typecheck (strict)
npm run lint       # expo lint
cd server && npx tsc --noEmit   # server typecheck
```

## Status

Stages 1–4 of the build order are built and verified on-device: onboarding (seeds → archetype → ambition → seeded first debrief), the voice debrief pipeline (record → transcribe → Echo responds with recent-debrief memory), and the career home screen (broadcast-hub design, fixtures, debrief log, mind map). Form/attributes, seasons, and health data are not started — see `CLAUDE.md` for what's deliberately deferred.
