# AttendScanner

A cross-platform React Native Expo app for event check-in via QR codes at Hack Club events.

## Features

- **QR Code Scanning**: Scan participant QR codes (`attend:P:{uuid}` format) for instant check-in
- **OAuth Authentication**: Secure login with Hack Club OAuth
- **Offline Support**: Queue scans when offline and sync when connection is restored
- **Medical Alerts**: Prominently display anaphylaxis risks and high support needs
- **Participant Search**: Search participants by name or email
- **Emergency Contacts**: Tap-to-call emergency contacts

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator, or Expo Go app on a physical device

### Installation

```bash
cd attend-ios
npm install
```

### Development

```bash
# Start the development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android
```

## Project Structure

```
attend-ios/
├── App.tsx                 # Entry point with navigation
├── app.json               # Expo configuration
├── src/
│   ├── types/             # TypeScript interfaces
│   ├── services/
│   │   ├── api.ts         # REST API client
│   │   ├── auth.ts        # OAuth authentication
│   │   ├── storage.ts     # Secure token storage
│   │   └── sync.ts        # Offline sync service
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useParticipants.ts
│   │   └── useScanner.ts
│   ├── context/
│   │   └── AppContext.tsx # Global state management
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── EventListScreen.tsx
│   │   ├── ScannerScreen.tsx
│   │   ├── CheckedInScreen.tsx
│   │   ├── SearchScreen.tsx
│   │   └── ParticipantDetailScreen.tsx
│   ├── components/
│   │   ├── ParticipantRow.tsx
│   │   ├── AlertBadge.tsx
│   │   ├── StatusBadge.tsx
│   │   └── EmergencyContactCard.tsx
│   └── theme/
│       └── colors.ts      # Hack Club brand colors
```

## API Endpoints

The app communicates with the Attend backend at `https://attend.hackclub.com`:

- `POST /api/v1/session` - Exchange OAuth code for token
- `GET /api/v1/events` - List accessible events
- `GET /api/v1/events/:id/participants` - Get event participants
- `GET /api/v1/events/:id/participants/search` - Search participants
- `POST /api/v1/events/:id/scans` - Record a check-in scan

## QR Code Format

Participant QR codes follow the format: `attend:P:{uuid}`

Example: `attend:P:550e8400-e29b-41d4-a716-446655440000`

## Configuration

OAuth is configured in `app.json` with the scheme `attendscanner` for the callback URL:
`attendscanner://oauth/callback`

## Theme

Uses Hack Club brand colors:
- Red: `#EC3750`
- Orange: `#FF8C37`
- Yellow: `#F1C40F`
- Green: `#33D6A6`
- Blue: `#338EDA`

## License

Proprietary - Hack Club
