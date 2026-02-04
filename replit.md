# Family Frame

## Overview

Family Frame is a Progressive Web Application (PWA) designed for smart screens, transforming home displays into a dedicated social network for households. It offers an "always-on" ambient experience focused on shared atmosphere (weather across family locations), living memory (Google Photos integration), and household synchronization (shared family calendar). The project aims to provide a low-cognitive-load, family-friendly interface for wall-mounted displays.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack React Query for server state management.
- **UI**: shadcn/ui with Radix UI primitives, Tailwind CSS for styling, and Material Design 3 principles adapted for ambient displays.
- **Backend**: Node.js with Express, TypeScript (ESM modules).
- **Authentication**: Clerk for user authentication and session management.
- **Database**: Firebase Realtime Database for primary data storage, with Zod for schema validation. Drizzle ORM is configured for PostgreSQL as a secondary option.

### Key Design Decisions
- **Ambient UI Design**: Optimized for distance viewing on smart screens, featuring large fonts, high contrast, and minimal interactive elements to reduce cognitive load.
- **Data Architecture**: Firebase Realtime Database is chosen for its real-time synchronization capabilities, critical for an always-on display. All persistent state is managed server-side.
- **Authentication**: Clerk provides secure user management, with server-side validation of session tokens.
- **Shared Schemas**: Zod schemas ensure type consistency and runtime validation across frontend and backend.
- **PWA Support**: Includes manifest.json, landscape orientation lock, and safe area support for dedicated device integration.
- **Component Reusability**: Applications expose reusable widgets that can be composed, avoiding duplication.
- **Centralized Settings**: All application preferences are managed through a centralized Settings feature, ensuring a single source of truth.
- **Exclusive Resource Access**: Hardware resources (audio output, video display, camera) can only be used by one feature at a time. A singleton pattern prevents conflicts - starting audio in one feature must stop audio in another. Current implementation: `RadioService` in `client/src/lib/radio-service.ts`.
- **External Media Integration**: Third-party media sources have varying CORS policies. The application must detect source type and configure requests accordingly (e.g., streaming sources may require credentials, while redirect-based sources may not). Always wait for media readiness before playback to prevent race conditions.
- **Responsive Input Persistence**: User inputs (sliders, toggles) must feel instant while persisting efficiently. Update UI immediately on change; persist to backend only on commit/blur. This balances responsiveness with API efficiency.
- **Graceful Media Failure**: Media playback will fail - sources go offline, formats change, networks drop. Classify errors by recoverability: user-initiated interruptions (ignore), format errors (skip to next), network errors (retry with backoff). Never leave the user with a frozen player.

### Media Services
Audio and video playback require centralized management to prevent resource conflicts and ensure consistent behavior across features.
- **Audio Playback**: Single service handles all audio output. Supports two modes: continuous streams (live radio) and finite playlists (track-based content). Current implementation: `RadioService`.
- **Content Sources**: Archive.org (public domain audio), Bulgarian radio streams, video streaming via M3U8/embedded players.

### Audio Content Classification (Global Rules)
The application distinguishes between two fundamentally different audio experiences:

**Radio (Live Streams)**
- Continuous, real-time audio streams with no defined end
- Cannot skip, rewind, or select specific content
- User controls: play/pause, volume, station selection
- Examples: Bulgarian radio stations, live broadcasts
- Technical: HLS/M3U8 streams, direct audio streams
- UI: Station list with country tabs, "now playing" indicator

**Playlists (On-Demand Audio)**
- Finite collection of individual tracks with defined durations
- Can skip, shuffle, repeat, and select specific tracks
- User controls: play/pause, next/previous, volume, track selection
- Examples: Baby Songs (nursery rhymes, lullabies, animal sounds)
- Technical: Direct MP3/audio file URLs from Archive.org
- UI: Track list with categories/filters, playback progress, queue management

**Naming Convention**
- "Radio" = live streaming content (e.g., "BG Radio", "Serbian Radio")
- "Songs/Music/Sounds" = on-demand playlist content (e.g., "Baby Songs")
- Never use "Radio" for playlist-based content to avoid user confusion

### Feature Specifications
- **Picture Frame**: Supports Google Photos (with OAuth2 flow and session-based selection) and Pixabay for ambient photo streams. Includes configurable slideshow intervals and a fullscreen mode.
- **Notepad**: Shared family notes with CRUD operations, pin/unpin functionality, and auto-save.
- **Messaging**: Household-to-household communication with read/unread status and counts.
- **Home Dashboard (Authenticated)**: Displays a customizable layout of widgets including Clock, Weather, Connected Households (or Stock Indices as fallback), and a horizontal info bar.
- **Landing Page (Unauthenticated)**: Marketing page showcasing features, with required legal links for compliance.
- **Stocks**: Displays market data for tracked symbols with auto-refresh.
- **Baby Songs**: Age-appropriate on-demand audio content from Archive.org. Features playlist-based playback with skip/next controls, situation-based organization (Morning, Playtime, Quiet, Mealtime, Bedtime), and age group filtering (0-72 months). Songs are tagged with multiple situations. This is a playlist feature, not a radio stream.
- **Calendar**: Shared family calendar with event types and navigation.
- **Shopping List**: Categorized shopping items with quantity controls and persistence.
- **TV Streaming**: Dedicated page for video streaming with fullscreen mode and control overlay.

## External Dependencies

### Authentication
- **Clerk**: `@clerk/clerk-react`, `@clerk/clerk-sdk-node`

### Database
- **Firebase Realtime Database**: `https://sash-d5c2d-default-rtdb.firebaseio.com/`
- **PostgreSQL**: Configured via Drizzle (optional)

### External APIs
- **Google Photos Picker API**: For photo selection (requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- **Pixabay API**: For ambient stock photos (requires `PIXABAY_API_KEY`).
- **Open-Meteo API**: For weather data and geocoding (no API key).
