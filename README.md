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

## Checks

```bash
npx tsc --noEmit   # typecheck (strict)
npm run lint       # expo lint
cd server && npx tsc --noEmit   # server typecheck
```

## Status

Stages 1–4 of the build order are built and verified on-device: onboarding (seeds → archetype → ambition → seeded first debrief), the voice debrief pipeline (record → transcribe → Echo responds with recent-debrief memory), and the career home screen (broadcast-hub design, fixtures, debrief log, mind map). Form/attributes, seasons, and health data are not started — see `CLAUDE.md` for what's deliberately deferred.
