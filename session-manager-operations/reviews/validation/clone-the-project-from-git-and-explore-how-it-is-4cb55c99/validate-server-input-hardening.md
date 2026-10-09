# Validation: server input hardening

Base: 3c532e71e52ee744162b5650850357f943211358. Reviewed HEAD 0511d0e (local `main` == `origin/main` at 0511d0e, so all three commits are on origin/main).
PRD files found in `prds-archived/` (31, 32, 33).

Gate runs (`npm test`, `npm run build`):
- `tsx --test server/*.test.ts`: 74/74 pass (run in /home/bilko/Projects/family-frame, same commit).
- `npm run build`: exit 0 (dist/index.cjs 1003.8kb).
- `vitest run` (first half of `npm test`): **could not run**. `vitest` is not installed in any checkout's node_modules (worktree has no node_modules; main's node_modules lacks vitest and `@clerk/express`, so it predates 539be4c / 5aafbcd). Only `client/src/lib/format.test.ts` is vitest-run; it is outside these PRDs. `npx tsc --noEmit` fails only on the missing `@clerk/express` module in the stale install.

## public-endpoints-cache-and-timeouts (bb73932) — VERIFIED
- 5-min cache: `memoTTL` at server/routes.ts:91; `PUBLIC_CACHE_TTL_MS` 5 min (:86); used by `getRadioStations` (:1116), `getTvChannels` (:1206), `getRadioValidation` (:1455). In-flight sharing, failures not cached.
- Bodies released: `discardBody` (:103-105) used after every HEAD/GET probe (:1128, :1144, :1400, :1411, :1503-ish); validate reader cancelled in `finally` (:1526).
- Pixabay: `PIXABAY_MAX_PER_PAGE = 50` (:89), clamp at :2701; cache by tag+page+perPage, 10 min (:88, :2685, :2706-2711).
- Pixabay login: required (401 without `x-clerk-user-id`, :2688). `grep -rn pixabay client/src` shows the only caller is client/src/pages/photos.tsx:276 (authenticated page), so the logged-out landing does not call it. Login is required.
- Timeouts: every `fetch(` in routes.ts (15 sites) and google-photos.ts:22 carries `AbortSignal.timeout` (10s default `FETCH_TIMEOUT_MS`, 5s `HEALTH_CHECK_TIMEOUT_MS`); the 1-line `fetch(`s at :877, :1752-1763, :2117, :2725, :3495, :3533 and the multi-line ones at :1121, :1137, :1396, :1407, :1495, :2082, :2147, :2625 were each read.
- `/api/connections/weather` uses `Promise.all` (:774).

## validate-settings-people-connections-input (d66736d) — VERIFIED
- Settings: `updateUserSettingsSchema` (shared/schema.ts) = `userSettingsSchema.omit(selectedPhotos, pickerSessionId, googlePhotosConnected).partial().strict()`, radioStation constrained to http(s) URL; handler returns 400 before write (routes.ts ~:196-205). googleTokens is not in the schema so `.strict()` rejects it.
- People: `updatePersonSchema` = partial strict with `BIRTHDAY_PATTERN`; handler 404s when person missing (~:318-340); empty-string birthday treated as clear.
- Connections delete: `isValidConnectionUserId` (/^user_[A-Za-z0-9]+$/) → 400, not in connections → 404, both before the Firebase path is built (~:719-731).
- server/routes-validation.test.ts exists, imports schema only (no Firebase/network); passes under tsx.

## validate-lists-and-messages-input (0511d0e) — VERIFIED
- Shopping/chores/recipes: `saveShoppingListSchema`, `saveChoresSchema`, `saveRecipesSchema` (z.array of item schemas) → 400 on failure (routes.ts ~:2812, :3406, :3464).
- Playlists: `createPlaylistSchema`/`updatePlaylistSchema`; zod object strips id/createdAt/updatedAt on PATCH (routes.ts ~:3581, :3625).
- Messages: `insertMessageSchema` omits toUsername (stripped), content max 2000 (`MESSAGE_MAX_LENGTH`); toUsername from `recipientData.username` (~:3249); `linkedEventId` kept on both copies (~:3268, :3282).
- Tests extended in server/routes-validation.test.ts (valid/empty/oversized/extra id).

## Cross-check: client writes vs new schemas — PASS
- PATCH /api/settings senders: radio.tsx:63 (radioVolume, radioStation, radioEnabled), baby-songs.tsx:172 (radioVolume, babySongsShuffleEnabled, babySongsFavorites, babyAgeMonths), tv.tsx:153 (lastTvChannel, tvVolume), app-settings.tsx:129 (temperatureUnit, weatherDisplayMode, timeFormat, clockStyle, photoSource, photoInterval, babyAgeMonths, tvVolume, lastTvChannel, trackedStocks), settings.tsx:304 (homeName, location, visibleApps, appOrder). All keys exist in userSettingsSchema and none are server-owned.
- PATCH /api/people/:id sends {name, birthday} (settings.tsx:386); fine. POST /api/people/new unchanged.
- DELETE /api/connections/:userId (settings.tsx:359) uses Clerk ids `user_...` from the connections list; fine.
- POST /api/shopping `{items}` (shopping.tsx:52) matches ShoppingItem {id,name,aisle,checked}; POST /api/chores `{chores}` and /api/recipes `{recipes}` send the shared `Chore`/`Recipe` types.
- POST /api/messages sends toUserId, toUsername, content (messages.tsx:77); extra toUsername is stripped, not rejected.
- No client code writes /api/playlists (only a query key in api.ts:56); custom playlists are not exercised by the client.

## Findings
### Critical
- none
### Important
- Environment: `vitest` missing from installed node_modules, so `npm test` cannot complete here (install is stale vs package-lock). `npm ci` needed before the scheduler's gate can go green; the tsx half passes.
### Minor
- server/routes.ts:2685 `pixabayCache` Map is never pruned; keys bounded by tag values (user-supplied `tag` query), so it can grow unboundedly. Add a size cap.
- server/routes.ts:877 `{ signal: ..., ...init }` lets a caller-supplied `init.signal` override the timeout; current callers pass their own signal intentionally.
- Client sends `toUsername` that the server now ignores; harmless, could be dropped client-side.
- Chores/recipes schemas are non-strict, so unknown keys are silently stripped rather than rejected.
