---
paths:
  - "shared/apps.ts"
  - "shared/schema.ts"
  - "client/src/App.tsx"
  - "client/src/lib/app-registry.ts"
  - "client/src/lib/app-lifecycle.ts"
  - "client/src/lib/display-layout.ts"
  - "client/src/components/app-*.tsx"
  - "client/src/components/welcome-card.tsx"
  - "client/src/pages/home.tsx"
  - "client/src/pages/screensaver.tsx"
  - "client/src/pages/radio.tsx"
  - "client/src/pages/baby-songs.tsx"
  - "server/apps/**"
  - "server/default-user.ts"
---
# App registry (framework vs apps)

- Every `APP_MANIFESTS` entry sets `category` (one of `APP_CATEGORIES`) and `needs` (`[]` if none). A new need type needs an `APP_NEED_COPY` entry and an `appNeedStatus` rule (both `shared/apps.ts`).
- `AppPage` (`client/src/components/app-page.tsx`) is the one page where an app is added, set up and configured; Settings > Apps (`client/src/components/app-picker.tsx`) and the gear sheet (`client/src/components/app-settings.tsx`) render it. Never build a separate per-app setup screen.
- Shell files (`client/src/components/app-sidebar.tsx`, the `client/src/App.tsx` router, app-picker, home, screensaver, app-settings sheet, `client/src/pages/landing.tsx`) read the registry; never hard-code app ids there.
- Adding an app fills only these slots: `APP_IDS` + `APP_MANIFESTS` (`shared/apps.ts`); `APP_ICONS` (`client/src/lib/app-registry.ts`); `APP_PAGES` (`client/src/App.tsx`); optional `APP_SETTINGS_PANELS` (`client/src/components/app-settings-panels.tsx`); optional `runAppDisableHook` case (`client/src/lib/app-lifecycle.ts`); server routes in `server/apps/` (one file per app id), registered from `server/routes.ts`.
- Visibility: new households get only home, settings, clock and weather (`defaultEnabled` -> `DEFAULT_VISIBLE_APP_IDS`, seeded by `server/default-user.ts`); `visibleApps` undefined = legacy all-on.
- Everything else is chosen by the household: `STARTER_PACKS` / `applyStarterPack` (`shared/apps.ts`) via `POST /api/settings/apps/setup` (apply a pack or mark setup done), offered by the one-time Home welcome card (`client/src/components/welcome-card.tsx`, `shouldShowWelcome` in `client/src/lib/display-layout.ts`).
- Settings are owned per app: a new key goes in `APP_SETTINGS_KEYS` or `HOUSEHOLD_SETTINGS_KEYS` (`shared/schema.ts`); the test "every settings key is owned exactly once" in `server/settings-defaults.test.ts` enforces it.
- Defaults are applied on read by `withSettingsDefaults` (`shared/schema.ts`), never seeded; new users get sparse settings.
- Changes go through `PUT /api/settings/apps/:appId` and `POST /api/settings/apps/:appId/move` (`server/app-visibility.ts`).
- Turning an app off hides it from screens but keeps its data and agent/MCP access.
- Audio naming: "Radio" means live streams with no defined end (no skip or rewind; station list and now-playing). "Songs", "Music" or "Sounds" means on-demand playlists of finite tracks (skip, shuffle, track list), such as Baby Songs. Never call playlist content "Radio".

The app list itself lives in `shared/apps.ts` (`APP_IDS`, `APP_MANIFESTS`); read it there, not here.
