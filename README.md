# Attend for iOS & Android

The mobile companion app for [Attend](https://attend.hackclub.com), Hack Club's event attendance platform. Organizers use it to check participants in at the door; participants use it to carry their tickets.

Built with Expo / React Native, with native Swift modules for Live Activities and Apple Wallet.

## What it does

**For organizers:**

- **QR check-in** — scan participant QR codes (`attend:P:{uuid}`) for instant check-in
- **NFC badges** — write and scan NFC badges for tap-to-check-in
- **Offline-first** — scans queue locally when offline and sync automatically when connectivity returns
- **Participant search & filtering** — Airtable-style filtering across the participant list, with medical alerts (anaphylaxis risk, high support needs) surfaced prominently
- **Emergency contacts** — tap-to-call from a participant's detail view
- **Airport mode** — live view of participants in transit: flight legs, arrival status, and unaccompanied-minor pickup tracking
- **Kiosk mode** — PIN-locked self-serve check-in station for a spare iPad at the door
- **Biometric lock** — Face ID / Touch ID gate on sensitive participant information

**For participants:**

- **My tickets** — view event tickets with QR codes
- **Apple Wallet** — add tickets as Wallet passes
- **Live Activities** — event-day status on the Lock Screen and Dynamic Island
- **Push notifications** — event updates from organizers

## Getting started

### Prerequisites

- Node.js 18+
- Xcode (for iOS) or Android Studio (for Android)
- An [Attend](https://attend.hackclub.com) account

> [!NOTE]
> The app uses native modules (NFC, Live Activities, Wallet), so it will not run in Expo Go — you need a development build.

### Setup

```bash
npm install
```

Create a `.env.local` with your backend and OAuth config:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_OAUTH_CLIENT_ID=your-oauth-client-id
```

Then build and run a development client:

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

### Scripts

```bash
npm test           # jest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Project structure

```
src/
  screens/     one file per screen (scanner, kiosk, airport mode, tickets, ...)
  services/    api client, auth, offline sync, NFC, notifications, storage
  hooks/       useScanner, useParticipants, useNFC, useAuth, ...
  components/  shared UI
modules/
  activity-controller/  native Swift module for starting/updating Live Activities
  wallet/               native Swift module for adding Apple Wallet passes
targets/
  widget/      WidgetKit extension rendering the Live Activity
```

The backend is a Rails app that serves the API this app talks to, handles OAuth, and issues Wallet passes.

## Releases

Builds and submissions go through [EAS](https://expo.dev/eas) — see [eas.json](eas.json) for the profiles. JS-only changes ship over the air:

```bash
bin/ota "what changed"
```

The `bin/ota` script temporarily stashes local `.env` files so development values never leak into a production bundle.
