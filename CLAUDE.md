# Family Frame

## Overview

Family Frame is a Progressive Web App (PWA) designed as "The Window Between Homes" - a dedicated social platform for households to share information and stay connected. It transforms smart screens into family-oriented display devices with a "grandma-friendly" design philosophy for multi-generational use.

## Core Features

- **Clock**: Real-time display with timezone support
- **Weather**: Current conditions and forecasts via Open-Meteo API (supports Celsius/Fahrenheit)
- **Photos**: Digital photo frame powered by Google Photos or Pixabay with customizable slideshow intervals
- **Calendar**: Shared family events with birthday tracking
- **Messages**: Household messaging system with unread count tracking
- **Radio**: Bulgarian radio station streaming with metadata display
- **Baby Songs**: Age-specific nursery rhymes (0-6 years)
- **TV**: Bulgarian television channels streaming (HLS-based)
- **Shopping List**: Shared grocery/shopping lists
- **Stocks**: Market tracking (Dow Jones, Bitcoin, Real Estate, MSFT, CRM, ISRG)
- **Notepad**: Shared note-taking
- **Chores**: Shared household chore tracking
- **Recipes**: Shared family recipes
- **Screensaver**: Full-screen ambient display mode for mounted screens
- **Household Connections**: Connect and view family members' homes with real-time weather

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build and dev server
- Tailwind CSS with custom "Hearth & Heritage" warm color palette
- shadcn/ui component library (Radix UI primitives)
- React Query for server state management
- Wouter for client-side routing
- Clerk for authentication
- HLS.js for video streaming
- Framer Motion for animations

### Backend
- Express.js with TypeScript
- Firebase Realtime Database for user data storage
- Clerk JWT verification for auth

### External Services
- Clerk: Authentication and user management
- Firebase: Real-time data (notes, messages, events, settings)
- Open-Meteo API: Weather data (no API key required)
- Google Photos API: Photo sync via OAuth picker
- Pixabay API: Stock photo source for the photo frame

## Project Structure

```
/family-frame
├── client/                      # React frontend (Vite SPA)
│   └── src/
│       ├── App.tsx             # Main app with auth flow
│       ├── main.tsx            # React entry point
│       ├── index.css           # Global styles (Tailwind + custom utilities)
│       ├── pages/              # Route pages (home, clock, weather, photos, calendar, messages, radio, tv, baby-songs, shopping, stocks, notepad, chores, recipes, screensaver, settings, ...)
│       ├── components/
│       │   ├── ui/             # shadcn components
│       │   ├── app-sidebar.tsx # Navigation sidebar
│       │   ├── empty-state.tsx # Reusable empty state component
│       │   ├── fullscreen-button.tsx # Reusable fullscreen toggle
│       │   └── [widgets].tsx   # Clock, Weather, Stock widgets
│       ├── hooks/
│       │   └── use-fullscreen.ts # Fullscreen hook with auto-enter support
│       └── lib/
│           ├── api.ts          # Query keys, mutation helpers
│           ├── format.ts       # Formatting utilities (dates, temps)
│           ├── queryClient.ts  # React Query setup + apiRequest helper
│           ├── radio-service.ts # Singleton radio player service
│           └── utils.ts        # cn() helper
├── server/                      # Express backend
│   ├── index.ts                # Express app setup, middleware
│   ├── routes.ts               # All API endpoints
│   ├── middleware.ts           # Auth middleware, async handler, utilities
│   ├── auth.ts                 # Clerk verification + PAT auth branch
│   ├── config.ts               # getAppBaseUrl() (APP_BASE_URL)
│   ├── url-guards.ts           # Outbound URL validation (SSRF guards)
│   ├── oauth-state.ts          # Signed OAuth state (SESSION_SECRET)
│   ├── api-tokens.ts           # Personal access tokens
│   ├── mcp.ts                  # MCP server at /mcp
│   ├── calendar-service.ts     # Shared calendar logic (REST + MCP)
│   ├── firebase.ts             # Firebase initialization & helpers
│   ├── weather.ts              # Open-Meteo integration
│   ├── google-photos.ts        # Google Photos OAuth & picker
│   ├── photo-cache.ts          # Photo caching
│   ├── *.test.ts               # Server tests (node:test via tsx)
│   └── static-pages/           # Pre-rendered SEO pages
├── shared/                      # Shared schemas & types
│   └── schema.ts               # Zod schemas for validation
└── script/
    └── build.ts                # Build script (esbuild + Vite)
```

## Development Commands

```bash
npm run dev      # Start dev server (Express + Vite on port 5000)
npm run build    # Build for production (client → dist/public/, server → dist/index.cjs)
npm start        # Run production build
npm run check    # TypeScript type checking
npm test         # vitest (client) + node:test via tsx (server/*.test.ts)
```

`npm run dev` loads a local `.env` (via `--env-file`) if present. `.env` is git-ignored; never commit it. Local dev uses the **production Firebase database**, so edits made locally change real data.

## Environment Variables

```env
# Required
VITE_CLERK_PUBLISHABLE_KEY    # Frontend Clerk publishable key (also read server-side)
CLERK_SECRET_KEY              # Backend Clerk secret
FIREBASE_SERVICE_ACCOUNT      # JSON service account key

# Optional
APP_BASE_URL                  # Public base URL for OAuth redirects and weather User-Agent (default https://family-frame.replit.app)
SESSION_SECRET                # OAuth state signing secret
GOOGLE_CLIENT_ID              # Google Photos OAuth client ID
GOOGLE_CLIENT_SECRET          # Google Photos OAuth client secret
PIXABAY_API_KEY               # Pixabay photo source
PUBLISHABLE_KEY_PROD          # Server-side Clerk key override (prod)
PUBLISHABLE_KEY_DEV           # Server-side Clerk key override (dev)

# Set by tooling/platform (not configured by hand)
NODE_ENV                      # Set by npm scripts
PORT                          # Listen port (default 5000)
REPLIT_DEPLOYMENT             # "1" on Replit deployments
TZ                            # Only used by client tests
```

## Architecture Patterns

### Authentication Flow
1. Clerk Provider wraps the app
2. User redirected to landing if not signed in
3. Headers injected with `x-clerk-user-id` and `x-clerk-username`
4. Server middleware verifies JWT tokens
5. Protected routes check `x-clerk-user-id` header

### Data Flow
1. React Query handles all data fetching/caching on client
2. API requests use `apiRequest()` helper with credentials
3. Server routes validate headers, fetch/update Firebase data
4. Zod schemas validate data on both client and server

### React Query Configuration
- `staleTime: Infinity` (manual refetch only)
- `refetchOnWindowFocus: false`
- `retry: false`

### Query Keys (client/src/lib/api.ts)
Use centralized query keys for consistency:
```typescript
import { queryKeys } from "@/lib/api";

// Usage in useQuery
const { data } = useQuery({ queryKey: queryKeys.messages.all() });
const { data } = useQuery({ queryKey: queryKeys.calendar.events() });
```

### Mutation Helpers (client/src/lib/api.ts)
Use typed mutation hooks for CRUD operations:
```typescript
import { useCreateMutation, useUpdateMutation, useDeleteMutation } from "@/lib/api";

// Create with automatic invalidation and toast
const createMutation = useCreateMutation("/api/resource", {
  successMessage: "Created!",
  invalidateKeys: [queryKeys.resource()],
});

// Update with dynamic endpoint
const updateMutation = useUpdateMutation(
  (id) => `/api/resource/${id}`,
  { invalidateKeys: [queryKeys.resource()] }
);
```

### Agent / MCP Access
Operator guide: `docs/agent-access.md`. Agents authenticate with personal access tokens (`ff_pat_...`, hash-only in Firebase).
- `server/api-tokens.ts` - token create/verify/revoke and the scope list (`API_TOKEN_SCOPES`)
- `server/auth.ts` - session-header middleware; the PAT branch sets identity headers and enforces a path allowlist
- `server/mcp.ts` - stateless Streamable-HTTP MCP server at `/mcp`; tools are thin wrappers over services
- `server/calendar-service.ts` - shared calendar logic used by both REST routes and MCP tools
- Rule: any new PAT-reachable path must be added to the allowlist in `server/auth.ts` with a scope; new MCP tools check scope in `server/mcp.ts` and reuse a service, never duplicate route logic.
- Tokens cannot manage tokens (`/api/tokens/*` stays off the allowlist).

### Server Middleware (server/middleware.ts)
Use `asyncHandler` to eliminate try-catch boilerplate:
```typescript
import { asyncHandler, getOrCreateUser, toArray } from "./middleware";

app.get("/api/resource", asyncHandler(async (req, res) => {
  const userId = req.headers["x-clerk-user-id"] as string;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userData = await getOrCreateUser(userId, username);
  res.json(toArray(userData.items)); // Normalizes Firebase arrays
}));
```

## Coding Conventions

### React
- Functional components with hooks only
- Custom hooks for reusable logic (useWeatherData, useWakeLock, useClock, useFullscreen)
- Skeleton components for loading states
- Error Boundary for top-level error handling

### Reusable Components
- `EmptyState` - Standard empty state with icon, title, description, action button
- `FullscreenButton` - Fixed-position fullscreen toggle button
- `useFullscreen({ autoEnter, onExit })` - Enhanced fullscreen hook with auto-enter and exit callback

### Styling
- Tailwind CSS utility classes
- CSS variables (HSL format) for theming
- Dark mode via `dark` class on HTML element
- Custom utilities: `hover-elevate`, `toggle-elevate`

### API Design
- RESTful endpoints: `GET /api/resource`, `POST /api/resource/new`, `PATCH /api/resource/:id`
- JSON request/response with Zod validation
- Credentials included in all requests

### Format Utilities (client/src/lib/format.ts)
- `formatTemperature(temp, unit)` - Convert and format temperature
- `formatRelativeTime(dateString)` - "5m ago", "2h ago", etc.
- `formatDateDisplay(date)` - "2024/01/15" format
- `parseLocalDate(dateStr)` - Parse YYYY-MM-DD without timezone issues
- `getRelativeDayLabel(date)` - "Today", "Tomorrow", or formatted date

### Naming
- Components: PascalCase (`HomePage`, `WeatherWidget`)
- Hooks: `useHookName` (`useWeatherData`)
- Utils: camelCase (`cn()`, `apiRequest()`)
- Constants: UPPERCASE (`RADIO_STATIONS`, `TV_CHANNELS`)

### Type Safety
- TypeScript throughout
- Zod schemas in `/shared/schema.ts` for runtime validation
- TypeScript inference from Zod (`z.infer<typeof schema>`)

## Key Files

- `client/src/App.tsx` - Main app with Clerk auth and routing
- `client/src/pages/home.tsx` - Dashboard with widget grid
- `client/src/pages/settings.tsx` - Comprehensive settings panels
- `client/src/lib/api.ts` - Query keys and mutation hook factories
- `client/src/lib/format.ts` - Date/temperature formatting utilities
- `client/src/lib/queryClient.ts` - React Query setup and API helpers
- `client/src/lib/radio-service.ts` - Singleton audio player service
- `client/src/components/empty-state.tsx` - Reusable empty state component
- `client/src/hooks/use-fullscreen.ts` - Enhanced fullscreen hook
- `server/routes.ts` - All API endpoints (~30+ routes)
- `server/middleware.ts` - Auth middleware, async handler, utilities
- `server/firebase.ts` - Firebase initialization and data helpers
- `shared/schema.ts` - Zod schemas and TypeScript types
- `tailwind.config.ts` - Custom color palette and theme

## Deployment

- **Platform**: Replit (autoscale deployment)
- **Port**: 5000
- **Build**: `npm run build`
- **Run**: `node ./dist/index.cjs`
- **Release**: push to GitHub `main`, then in Replit pull from the Git pane and click Publish. Secrets live only in Replit.

## Design Philosophy

The app uses a warm "Hearth & Heritage" color palette:
- Primary: Heritage Terracotta (#C05746)
- Secondary: Sage Leaf (#82937A)
- Accent: Soft Honey (#F4D06F)
- Background: Warm Parchment (#FDF8F2)

Designed for visibility on mounted displays with accessibility considerations including ARIA labels, keyboard navigation, and high contrast for multi-generational use.
