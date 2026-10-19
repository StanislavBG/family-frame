# Validation: naked-start plan

Base: 61fbcceb8cdc7c0ed4c8844ed80b02be73e71910 (commits c39bfec..2561a0f, plus 88a6052 for settings-defaults).
Gate re-run (all PRDs share it): `npm run check` exit 0 (tsc clean); `npm test` 512 tests, 0 fail.
Self-review of the combined diff (no slash-command review run; read the diff directly).

## settings-defaults-on-read: VERIFIED
- `appSetupDone` optional boolean added: shared/schema.ts:261.
- `SETTINGS_DEFAULTS` and `withSettingsDefaults`: shared/schema.ts:316-326. It never parses stored data, ignores null/undefined, and returns the defaults for non-object input.
- `HOUSEHOLD_SETTINGS_KEYS` and `APP_SETTINGS_KEYS` match the notes: shared/schema.ts:329-368.
- server/settings-defaults.test.ts exists and passes inside the 512.
- Existing-behaviour criterion: 88a6052 does not touch routes.ts or default-user.ts.

## sparse-new-household: VERIFIED
- default-user.ts seeds exactly homeName, location, visibleApps, appOrder, and no longer imports `userSettingsSchema`.
- GET /api/settings returns `withSettingsDefaults(userData.settings)`: routes.ts:192. PATCH stores `{...stored, ...change}` and responds with defaults applied: routes.ts:215.
- default-user.test.ts:31-49 checks exactly 4 keys and that the source has no radioStation, trackedStocks or userSettingsSchema.
- No migration of existing accounts anywhere in the diff.

## naked-defaults-starter-packs: VERIFIED
- `defaultEnabled` is true only for home, settings, clock and weather. `DEFAULT_APP_ORDER` matches the criterion.
- `STARTER_PACKS` has the four packs with the notes' copy. `applyStarterPack` returns null for an unknown pack, uses all apps for add with undefined visibleApps, and returns results in APP_IDS order with fixed apps always included (shared/apps.ts).
- app-manifest.test.ts and default-user.test.ts are updated and pass.

## starter-pack-route: VERIFIED (one criterion deviates, see Minor 1)
- Strict zod body with `packId` as nullable string max 40 and `mode` defaulting to "add": app-visibility.ts. 401 without a user, 400 for a bad body or unknown pack.
- `packId` is only compared against STARTER_PACKS, never used as a path. The write is `{...settings, appSetupDone: true, visibleApps?}`: null packId leaves visibleApps as stored.
- Response is `{visibleApps: resolveAppLayout(newSettings).enabledIds, appOrder: normalizeAppOrder(settings?.appOrder), appSetupDone: true}`.
- Tests cover add, replace, legacy undefined, null pack, unknown pack, bad mode, extra key and 401 (app-visibility.test.ts:123-168).
- server/auth.ts has no `settings` entry, so the route stays off the PAT allowlist.

## welcome-starter-card: VERIFIED
- `shouldShowWelcome` (display-layout.ts): null for undefined settings or appSetupDone; "legacy" for null/undefined visibleApps; "new" when only clock/weather are on; otherwise null. Tests cover it in display-layout.test.ts:69.
- welcome-card.tsx: pack buttons with `data-testid=welcome-pack-<id>`, mode add for new and replace for legacy, invalidates /api/settings, skip button text and navigation as specified, legacy copy as specified, min-h 44px, dark pairs, destructive toast on failure.
- home.tsx renders the card above the existing layout only when `welcome` is non-null.
- Nothing is switched off without a button press: replace mode runs only from a pack click.

## doc-naked-start: VERIFIED
- CLAUDE.md "App Registry" bullet replaced with the new-household wording. It names STARTER_PACKS/applyStarterPack, POST /api/settings/apps/setup, welcome-card.tsx and shouldShowWelcome. It states the APP_SETTINGS_KEYS/HOUSEHOLD_SETTINGS_KEYS rule and the withSettingsDefaults rule.
- The diff for this PRD touches only CLAUDE.md.

## Findings
### Critical
- none
### Important
- none
### Minor
1. server/route-inventory.snapshot.json does not contain `POST /api/settings/apps/setup`, which the starter-pack-route criterion asked for. `registerAppVisibilityRoutes` is registered from server/index.ts:116, not `registerRoutes`, so the inventory recorder never sees these routes. The existing PUT and move routes are absent too. The inventory test passes. The criterion cannot be met as written, so I treated its intent (the inventory test passing) as satisfied.
2. The shouldShowWelcome "new" branch treats a household that explicitly stored only clock/weather as new until appSetupDone is set. This is by design, with no data risk.
3. The PRD files were all found in prds-archived/, so none was missing.
