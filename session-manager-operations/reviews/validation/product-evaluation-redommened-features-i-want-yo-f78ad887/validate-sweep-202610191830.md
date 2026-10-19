# Validation sweep 202610191830

Base: 7222a8c2283875d83b0dae5012ba8eafd399a491 (HEAD 0118e43). Commits 88a6052..2561a0f.
Gate re-run for 335-339: `npm run check` exit 0; `npm test` exit 0 (vitest 267 passed, node:test 512 pass / 0 fail).

## settings-defaults-on-read — VERIFIED
- appSetupDone optional boolean: shared/schema.ts:261.
- SETTINGS_DEFAULTS / withSettingsDefaults (skips undefined/null, no parse, non-object -> defaults): shared/schema.ts:315-326.
- HOUSEHOLD_SETTINGS_KEYS / APP_SETTINGS_KEYS match the mapping: shared/schema.ts:329-369.
- Tests (ownership, defaults, stored wins, null, photoInterval 999): server/settings-defaults.test.ts, passing in npm test.
- Existing behaviour unchanged: that PRD's own commit touched only schema.ts and the test (later PRDs edited routes).

## sparse-new-household — VERIFIED
- Seed has exactly homeName, location, visibleApps, appOrder; no userSettingsSchema.parse: server/default-user.ts:10-19.
- GET returns withSettingsDefaults: server/routes.ts:192; PATCH stores merged stored+change, responds withSettingsDefaults: routes.ts:213-215.
- Tests in server/default-user.test.ts pass. No migration code for existing accounts.

## naked-defaults-starter-packs — VERIFIED
- defaultEnabled false on photos, calendar, messages; DEFAULT_APP_ORDER exact: shared/apps.ts:134,146,214,312-316.
- STARTER_PACKS (4 packs, text matches), StarterPackId, applyStarterPack (null unknown, add/replace, APP_IDS order, fixed always): shared/apps.ts:318-360.
- Tests in client/src/lib/app-manifest.test.ts and server/default-user.test.ts pass.

## starter-pack-route — VERIFIED (one criterion's premise wrong, see Minor)
- Route with strict body schema, 401, 400 bad body/unknown pack: server/app-visibility.ts:65-93; registered before :appId/move.
- packId non-null writes applyStarterPack + appSetupDone; null only sets appSetupDone; response shape matches: app-visibility.ts:79-96.
- Tests added in server/app-visibility.test.ts (7 cases), passing. Not on PAT allowlist (grep server/auth.ts: no match).
- Snapshot criterion: see Minor 1.

## welcome-starter-card — VERIFIED
- shouldShowWelcome: client/src/lib/display-layout.ts:31-39; branch tests in display-layout.test.ts pass.
- welcome-card.tsx: packs as buttons with data-testid welcome-pack-<id>, mode add/replace by kind, invalidates ["/api/settings"], secondary button copy and navigation, legacy copy, min-h-[44px], dark: pairs, destructive toast: client/src/components/welcome-card.tsx:12-76.
- home.tsx renders WelcomeCard first child only when welcome non-null: client/src/pages/home.tsx:58,106-110.

## doc-naked-start — VERIFIED
- CLAUDE.md App Registry section: new households get home/settings/clock/weather, STARTER_PACKS, applyStarterPack, POST /api/settings/apps/setup, welcome card, shouldShowWelcome; ownership rule and withSettingsDefaults rule; old bullet replaced (CLAUDE.md:315-318). 4 bullets, no code file in that commit.

## Findings

### Critical
none

### Important
none

### Minor
1. starter-pack-route criterion "route-inventory.snapshot.json includes POST /api/settings/apps/setup" is not literally met: the snapshot is unchanged. The premise was wrong: registerAppVisibilityRoutes is called from server/index.ts:116, not registerRoutes, so the inventory test never sees these routes (the existing PUT/move routes are absent too). The test passes; the new route has no inventory guard.
2. server/default-user.ts:16 `as UserData["settings"]` cast types a sparse object as full UserSettings; server code that reads settings without withSettingsDefaults must use optional chaining (PRD notes say it does). Not verified exhaustively.
3. welcome-card.tsx "legacy" path uses mode "replace" even for the "Keep all my apps" button, which sends packId null so mode is ignored server-side; harmless.

Self-review of combined diff (/code-review, /security-review not run as separate tools): no secrets; packId/appId never used as Firebase path; body is strict zod with max length; route needs x-clerk-user-id and is browser-session only. No duplication of existing helpers found.
