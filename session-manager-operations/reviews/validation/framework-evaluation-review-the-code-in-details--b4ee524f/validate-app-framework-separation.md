# Validation: app framework separation (PRDs 64-79)

Base: 2984f8ba00da86c7a51dd2682849fb65aae73041, HEAD 64fe48b. 17 commits, 43 files (+5631/-4327). PRD files found in `prds-archived/`.

## Gate results (re-run in this worktree)
The worktree has no `node_modules`. I symlinked the main checkout's `node_modules` for the run and removed the link afterwards. That install is incomplete (no `vitest`, no `@clerk/*`).
- `npm run check`: the only errors are `TS2307 Cannot find module '@clerk/react'` / `'@clerk/express'`. No other type errors. This is an environment gap, not a code defect.
- `npm test`: the vitest half did not run (`vitest: not found`). The client tests `app-manifest.test.ts` and `display-layout.test.ts` are therefore NOT re-run by me.
- `tsx --test server/*.test.ts`: 102 pass, 0 fail. This covers route-inventory, default-user, app-visibility, auth, mcp, url-guards and the rest.
- `npm run build`: failed to resolve react/clerk from the symlinked install. Not verifiable here.
- Coverage is partial. Server behaviour is machine-verified, and client behaviour is verified by reading only. Verdicts below rest on file evidence plus the server tests.

## Per-PRD verdicts and evidence
- 64-app-manifest: VERIFIED. `shared/apps.ts` has 7 `defaultEnabled: true` entries. `shared/schema.ts:187` re-exports `AppId` from `./apps`. `shared/schema.ts:232-233` has `visibleApps`/`appOrder` as `z.array(z.string().max(40)).max(50).optional()`. `client/src/lib/app-manifest.test.ts` is present; I did not run it.
- 65-server-apps-lists-messages: VERIFIED. `server/routes.ts:649-653` calls the five register functions and has no matching `app.<method>` for their paths. `initializeFirebase` is absent from `routes.ts`. `route-inventory.test.ts` passes without Firebase env, and the snapshot first appears in 61a41cc, the move commit.
- 66-seed-new-user-apps: VERIFIED. `server/default-user.ts` builds settings via `userSettingsSchema.parse` with `DEFAULT_VISIBLE_APP_IDS` and `DEFAULT_APP_ORDER`. It imports only types from `./middleware`, nothing from `./firebase`. Other fields are unchanged, and `default-user.test.ts` passes.
- 67-app-visibility-endpoint: VERIFIED. `server/index.ts:107-108` registers `registerAppVisibilityRoutes(app)` immediately before `registerRoutes`. `isPatPathAllowed` (`server/auth.ts:27-32`) lists only `/api/calendar/`, `/api/people/list` and `/mcp`, so `/api/settings/apps/*` is session-only. `app-visibility.test.ts` passes.
- 68-app-settings-panels-split: VERIFIED. `app-settings-panels.tsx` exists (535 lines) and `app-settings.tsx` no longer contains `picture-frame`. `app-settings.tsx` is 568 lines smaller in the diff.
- 69-client-app-registry: VERIFIED. `app-lifecycle.ts:8-9` stops the radio only when `mode === "stream"` and baby-songs only when `mode === "playlist"`. `app-registry.ts:105-106` invalidates `["/api/settings"]` and shows a destructive toast on error. `tsc` reports no `APP_ICONS` completeness errors.
- 70-server-apps-weather-calendar-stocks-babysongs: VERIFIED. `routes.ts:80,281,645,654` call the four register functions. No residual `/api/weather|calendar|market|youtube|playlists` registrations remain in `routes.ts`. `route-helpers.ts` exists. Inventory test passes.
- 71-shell-sidebar-header-registry: VERIFIED. `app-sidebar.tsx:31,69` enable the unread query via `isEnabled("messages")` and key the badge on `item.id === "messages"`. `app-controls.tsx:208-211` does the same for the header badge.
- 72-route-gate: VERIFIED. `App.tsx:208` defines `APP_PAGES: Record<AppId, ...>`, `:228-229` builds `APP_ROUTES` once from `APP_MANIFESTS` with `withAppGate` for non-fixed apps, and `:241` puts `NotFound` last. `app-gate.tsx` exists. Production build not verifiable here.
- 73-app-picker-extract: VERIFIED. `app-picker.tsx` exists and `settings.tsx` renders it. Not run in a browser.
- 74-home-screensaver-respect-apps: VERIFIED. `display-layout.ts` and `display-layout.test.ts` exist (the test was not run). `screensaver.tsx:155-156` gates photos and weather on `modes.includes(...)`.
- 75-app-picker-details: VERIFIED. `app-picker.tsx:34` sets `aria-pressed` and `:92` is `lg:grid lg:grid-cols-2`. `:150,163,179-180` stop propagation on the controls, and `:194` is the sticky details column. `settings.tsx:780` uses `max-w-6xl` only for the apps section. `app-details-panel.tsx` exists.
- 76-landing-from-registry: VERIFIED. `landing.tsx` builds the list from `APP_MANIFESTS.filter(a => !a.fixed)`, and `:250` computes the count from `applications.length`. `App.tsx` no longer defines `LandingPage`.
- 77-server-apps-photos: VERIFIED. `apps/photos.ts` is 889 lines. `routes.ts:647` calls `registerPhotosRoutes(app)` and has no `/api/google|photos|pixabay` registrations. The snapshot was not touched by this commit.
- 78-server-apps-radio-tv: VERIFIED. `routes.ts:641-643` call `registerMediaProxyRoutes`, `registerRadioRoutes` and `registerTvRoutes`. `routes.ts` is 657 lines, under 1000. The snapshot diff vs the previous snapshot is a single reordered line, `GET /api/tv/channels`, which matches the allowed change. Server tests pass. Build not verifiable here.
- 79-doc-app-registry: VERIFIED. `CLAUDE.md` has the App Registry subsection (lines ~195-215), the Project Structure tree and the Key Files list. Every path it names exists.

## Cross-cutting checks
- Shell files (app-sidebar, app-controls, app-picker, app-settings, App.tsx, home, screensaver, landing) have no hand-written app-id list. The only literal ids are:
  - `"messages"`, used as a feature gate;
  - the `APP_PAGES` map keys in `App.tsx`, which is the declared slot;
  - screensaver mode names, which are display modes, not apps.
- `/api/settings/apps/*` is not on the PAT allowlist.

## Findings
### Critical
None.
### Important
None.
### Minor
- Client vitest suites and the production build could not be run in this environment (incomplete `node_modules`). Re-run `npm test` and `npm run build` on a full install before publishing.
- The `GET /api/tv/channels` snapshot reorder was not stated in a report I can see, but it is the one change the PRD allows.
- I did not review every line of the 5.6k-line moved-verbatim diff. I confirmed the route inventory (same sorted entries) rather than diffing handler bodies.
