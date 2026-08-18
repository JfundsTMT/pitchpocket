# PitchPocket

Career mode engine for real football players. See `CLAUDE.md` for product spec and build order.

## Stack

React Native + Expo (SDK 57), TypeScript, Expo Router (file-based routing in `src/app`).

## Get started

```bash
npm install
npx expo start
```

This app requires an Expo **development build** (not Expo Go) once native modules land — HealthKit / Health Connect integration is planned early, per the build order. For now `npx expo start` in Expo Go / web is enough to verify the scaffold.

## Status

Stage 1 of the build order: scaffold only. No onboarding, debrief, or career screens yet.
