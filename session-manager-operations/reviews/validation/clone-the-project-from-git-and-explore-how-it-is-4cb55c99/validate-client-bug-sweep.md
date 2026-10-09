# Validation: client bug sweep

Base: 3c532e71e52ee744162b5650850357f943211358. Reviewed at HEAD 5aafbcd (worktree branch; every fix commit below is contained in origin/main).

Gates re-run in the worktree after a fresh `npm ci` (the shared checkout's node_modules had no vitest):
- `timeout 300 npm test` (vitest run, then `tsx --test server/*.test.ts`): exit 0, 62 node tests pass, 0 fail.
- `timeout 300 npm run build`: exit 0.
- All `grep -q` gate lines verified by reading the matching lines (below).

## stable-guarded-routes — VERIFIED
- client/src/App.tsx:190-205 hoists 16 `const GuardedX = guarded(...)` at module scope; the only `guarded(` call sites are those plus the definition at :175.
- App.tsx:108 `const onHome = window.location.pathname === "/"` gates the error-boundary redirect.
- Commits 7a18558 / bb5d8ba on origin/main.

## add-person-endpoint-path — VERIFIED
- settings.tsx:370 `apiRequest("POST", "/api/people/new", data)`; server/routes.ts:255 defines it.
- settings.tsx:336 and :363 invalidate `["/api/connections/weather"]` (accept / remove).
- Other `/api/people` client uses: `/list` (settings:299, calendar:307, api.ts:18), `PATCH/DELETE /api/people/:id` (settings:386, 402). All exist in routes.ts:242/255/282/312.
- Commits 685d7c4 / 0f8be8a.

## client-local-date-handling — VERIFIED
- format.ts:40-45 `toISODateString` uses getFullYear/getMonth/getDate, zero-padded.
- weather-utils.ts:2,18 imports and uses `parseLocalDate`.
- calendar.tsx:432-433 prefills with `toISODateString(date)`; :274-288 midnight `setTimeout`, cleared at :288.
- format.test.ts runs under both America/Los_Angeles and Europe/Sofia (`describe.each`, :7) and asserts `formatDay("2026-10-09","en-US")` is "Fri" (:28); passes in `npm test`.
- Commit 68cb8ce.

## chores-dates-and-optimistic-save — VERIFIED
- chores.tsx:26 imports `parseLocalDate`; :183 and :477 use it; the only `new Date(...)` calls left are on `completedAt`/`createdAt` timestamps (:190, :411, :434, :482), not due dates.
- :74-80 overdue is `dueDate < todayString()` (local yyyy-MM-dd) and today is `===`, so a chore due today is never overdue.
- :377-393 the shared saveMutation computes from `getQueryData`, applies with `setQueryData` in onMutate, rolls back in onError with a destructive toast. Add/toggle/delete all go through it (:22/:33/:56 of the handler block).
- Commits b075b0e / d40cfb6.

## baby-songs-youtube-player-fixes — VERIFIED
- youtube-audio-player.tsx:111-119 refs updated every render; handlers call `handleNextRef.current()` (:216, :231), `onPlayStateChangeRef` (:219, :226).
- baby-songs.tsx:621 `key={selectedMoodStation.id}`; :349 playlist `useMemo` keyed on the station id.
- :105-107 shuffle in `useMemo([playlist, shuffleEnabled])`.
- :256-258 cleanup destroys the player on unmount; no setInterval/addEventListener is left unmatched (grep found none).
- Commits 22f7495 / e0e93b6.

## recipes-timer-and-tv-retry — VERIFIED
- recipes.tsx:378 `key={currentStep}`; :40-56 module-level shared AudioContext, `closeAudioContext` run on unmount (:79).
- recipes.tsx:765-783 `applyRecipeChange` reads `getQueryData`, applies optimistically, rolls back with destructive toast on error.
- tv.tsx:161-170 `reconnectAttemptsRef` increments across errors; reset at :201 (channel load, attempt 0) and :331 (playing); after max delays it sets the "Stream unavailable" state (:164-168).
- Commits d7f9d28 / e20b128.

## always-on-data-freshness — VERIFIED
- messages.tsx:25-26 `refetchInterval: 30_000`, `refetchOnMount: "always"`.
- notepad.tsx:394-395 `60_000` and `"always"`.
- home.tsx:69 `refetchInterval: 60_000`; :63 queryFn throws on `!res.ok`.
- Editor overwrite: NoteEditor receives `selectedNote` (notepad.tsx:387, 490, 606), a state snapshot, so its reset effect (:206) does not re-fire on refetch. No extra guard needed.
- Commits acc1366 / b37b3cc.

## shopping-save-errors — VERIFIED
- shopping.tsx:60-63 onError restores `confirmedList.current` and shows a destructive toast.
- :72-75 query data is copied into local state only when `pendingSaves.current === 0`.
- :46-47 `refetchInterval: 60_000`, `refetchOnMount: "always"`.
- Commits 7781a49 / 4734e2e.

## weather-today-local-date — VERIFIED
- server/weather.ts:91-97 exported `pickTodayIndex(dailyDates, currentLocalTime?)` slices `current.time` to the date and falls back to the server date when missing; :117 passes `data.current.time` (the query already requests `current=`).
- server/weather.test.ts covers 23:30 -> index 1, 01:00 -> index 0, missing time fallback, and no-match; all pass.
- Commit 309fe3f on origin/main.

## Findings

### Critical
- none

### Important
- none

### Minor
- session-manager-operations/scheduler/epics/.../prds/29-weather-today-local-date.md is still in `prds/`, not archived, although its commit landed (bookkeeping only).
- client/src/pages/recipes.tsx:769-776 rolls back to the snapshot taken at click time; two rapid overlapping changes where the first fails would revert the second too. Low likelihood on a household app.
- client/src/pages/shopping.tsx:60-63 rollback restores the last server-confirmed list, which discards still-pending later edits when an earlier save fails. Acceptable per the PRD wording.
- The shared checkout's node_modules is stale (no vitest), so `npm test` fails there until `npm ci`.

Review method: `/code-review` and `/security-review` were not run as separate tools; I self-reviewed the client changes for correctness, input handling, secrets and path handling. The changes are client-side state/date logic only. No new request surface, secrets or path handling were found.
