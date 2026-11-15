---
paths:
  - "client/**"
---
# Client rules

## Data
- React Query runs with staleTime Infinity, refetchOnWindowFocus false and retry false (`client/src/lib/queryClient.ts`): nothing refetches by itself, so invalidate the affected keys after every mutation.
- Use `queryKeys` and the `useCreateMutation` / `useUpdateMutation` / `useDeleteMutation` hooks from `client/src/lib/api.ts`; `useUpdateMutation` with an endpoint function sends no body unless `getBody` is given.
- `apiRequest` sends credentials (cookies) and no identity headers; the server sets the x-clerk-* headers itself after verifying the session.

## Routing
- Routing is wouter. Nested apps such as calendar use `~/` for absolute links (`~/calendar/day/YYYY-MM-DD`).
- Shell files read the app registry, never hard-coded app ids: see the apps rule file (.claude/rules/apps.md).

## Calendar Day view
- Layout and time formatting logic stays in `client/src/lib/calendar-day.ts` (pure, unit-tested).
- The day view only renders existing calendar events; it never creates any.
- The upcoming strip in `client/src/pages/calendar.tsx` shows only the cards that fit one row (`fitCount`, `client/src/lib/fit-scale.ts`); it never wraps or scrolls sideways.

## Styling
- Tailwind classes are literal strings, never built at runtime (Tailwind scans source); every light colour has a `dark:` pair.
- The `hover-elevate` and `toggle-elevate` utilities and the Hearth & Heritage palette (HSL variables, light and warm dark) live in `client/src/index.css`.
- Fonts are self-hosted with `@fontsource` imports in `client/src/main.tsx` (Inter Variable, Source Serif 4, JetBrains Mono); never add Google Fonts or another third-party font link (GDPR: they send visitors' IPs to a third party).

## Wall displays and accessibility
- Built for multi-generational use on wall displays: ARIA labels on icon-only controls, keyboard navigation for all controls, high contrast, large touch targets (at least 44 x 44 px).
- No hover-only information: a wall display has no pointer.
- Loading states use skeletons (`client/src/components/ui/skeleton.tsx`).

## Shared helpers
- "Today" comes from `useToday()` (`client/src/hooks/use-today.ts`), never `new Date()` at render, so displays roll over at midnight.
- Parse YYYY-MM-DD with `parseLocalDate` (`client/src/lib/format.ts`).
- Empty states use `EmptyState` (`client/src/components/empty-state.tsx`); fullscreen uses `useFullscreen` (`client/src/hooks/use-fullscreen.ts`).
