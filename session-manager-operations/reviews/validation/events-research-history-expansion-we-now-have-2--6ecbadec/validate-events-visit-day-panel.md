# Validation: events visit blocks + month day panel (PRDs 285-295)

Base: 9d29cae59c3fb23427e00395b25fb3d4effce190 (HEAD d7bb5ed). All PRD files found in `prds-archived/`.
Gates re-run in the job worktree (node_modules symlinked from the main checkout; it is gitignored):

| Command | Result |
| --- | --- |
| `npx tsx --test server/events-schema.test.ts` | 12/12 pass |
| `npx tsx --test server/events-visit.test.ts` | 11/11 pass |
| `npx tsx --test server/events-service.test.ts server/events-routes.test.ts server/events-service-routes.test.ts` | 45/45 pass |
| `npx vitest run client/src/lib/events.test.ts` | 20/20 pass |
| `npm run check` | exit 0 |
| `npm run events:test` | 162/162 pass |
| `npm run events:check` | exit 0 |

Review method: `git diff <base>..HEAD` read for the server, shared and pipeline files; UI files checked by grep and targeted reads. `/code-review` and `/security-review` were not run as skills here, so I self-reviewed: no secrets, no new routes, visit input is Zod-validated, and the SQL uses parameter binding.

## 285 events-visit-schema: VERIFIED
- `visitPlanSchema` is strict, regex has no offset, and the refine enforces same date, end > start and <= 720 min: `shared/events.ts:106-123`.
- `visit` is optional on `postResponseSchema` (`shared/events.ts:361`) and `patchPlanSchema` (`:372`); the empty-object refine is kept.
- Preferences `visitBlockMinutes` (60-240, 150), `visitEarliest` ("10:00") and `visitLatestEnd` ("18:00"): `shared/events.ts:306-308`.
- Tests: schema suite 12/12 pass.

## 286 events-visit-windows: VERIFIED
- `shared/events-visit.ts` exports `dayWindows` (:117), `DEFAULT_VISIT_PREFS` (:28), `suggestVisit` (:189), `shiftVisit` (:231), `resizeVisit` (:239) and `visitToPlan` (:248).
- Tests: 11/11 pass in `server/events-visit.test.ts`.

## 287 events-area-key-canonical: VERIFIED
- `areaKey` and `canonicalAreaKeyFromLegacy` in `services/events-pipeline/geo.ts:~123-170`: country aliases, state and code suffix stripping.
- The `SCHEMA_VERSION` bump to 4 plus `migrateAreaKeys` run only when `priorVersion < 4`, so a second open is a no-op: `db.ts:~77-122`.
- Tests: `events:test` 162/162 pass.

## 288 events-pipeline-lock-wait: VERIFIED
- `acquireLockWithWait` is exported, with no sleep after the last attempt: `cli.ts:131-142`.
- 40 x 30000 ms for non-watch modes; `watch` keeps single-try `acquireLock` and prints `{"skipped":"locked"}` with exit 0: `cli.ts:285-314`.
- Give-up prints `{"skipped":"locked","waitedMs":n}`, sends one critical notice and returns 1.
- The timer is `OnCalendar=*-*-* 05:32:00`.
- Tests: `events:test` pass.

## 289 events-visit-server: VERIFIED (one deviation, see Findings)
- `EventPlan.visit` is added and `assertVisitFits` returns 400 for a bad date or out-of-hours times: `server/events-service.ts:~249-269`.
- The matching session window sets `occurrenceStart`.
- `planDates` makes the calendar entry use `plan.visit`.
- `syncCalendar` skips date moves when `plan.visit` is set (:343).
- `ensureVisit` and `chooseDay` implement the default suggestion.
- Tests: 45/45 pass.

## 290 events-visit-prefs-ui: VERIFIED
- The "Visit planning" chips are in `events-preferences-panel.tsx` with `aria-pressed` (:133) and `min-h-[44px]` (:166); `npm run check` is clean.

## 291 events-local-retention: VERIFIED
- `pruneLocalState` in `db.ts:~286-321` has defaults 30/30/90, uses `substr(COALESCE(end_at,start_at),1,10)`, runs in one transaction and leaves households and geocode_cache alone.
- `cli.ts:409` calls it only for `all` without `--dry-run` and sets `stats.pruned`.
- Tests: pass.

## 292 events-day-entries: VERIFIED
- `DayEntry`, `eventDayEntries`, `formatClock` and `formatClockRange` are exported in `client/src/lib/events.ts:57-89`.
- Tests: vitest 20/20 pass.

## 293 events-visit-editor-ui: VERIFIED
- `VisitEditor` is at `event-actions.tsx:143` and has day chips, "Earlier"/"Later" with aria-labels, length chips, "Whole event" and "Hours not listed – check before you go".
- It uses `useToday` (:109) and is rendered in both the calendar confirm step (:455) and `ChangePlanDialog` (:317).
- Both send `visit: visitToPlan(block)` (:278, :405).
- The "Which date" group only shows when `hasOccurrences` (:290).
- "Your visit:" is shown at :496.
- Buttons use `min-h-11`.

## 294 events-month-day-panel: VERIFIED
- `EventsDayPanel` has the "At set times", "Open all day", "Suggested visit" and "Nothing planned for this day." text, and links via `encodeURIComponent`: `events-day-panel.tsx:44,126,133,148,159`.
- `events-month.tsx` takes `selectedDate`/`onSelectDate`; the day header is a button with `aria-pressed` (:175), "+N more" and "N open all day" are buttons, and the selected day has a ring with a `dark:` pair (:157).
- `pages/events.tsx` has the `lg:grid-cols-[minmax(0,1fr)_22rem] xl:...26rem` layout (:307), `lg:sticky lg:top-3` (:318), and `matchMedia` plus `scrollIntoView` (:209-211).

## 295 events-visit-docs: VERIFIED
- `docs/events.md` documents `plan.visit`, the `visit` field on both routes, the preference defaults, the section 6 rules, the section 8 items (area key, lock wait, 05:32, retention, `pruned`) and a "Data volume" paragraph.
- `CLAUDE.md` gains exactly the two bullets (diff: +2 lines).

## Findings

### Critical
- none

### Important
- `server/events-service.ts:~584` (`ensureVisit`): `if (!day || !day.hoursKnown) return;` skips the default visit suggestion for all-day events whose hours are unknown. PRD 289 has no hoursKnown exemption: any window longer than `visitBlockMinutes + 30` should get a suggestion. `docs/events.md` section 6 says "Days with no known hours count as 09:00-17:00", which describes a suggestion that the server never makes. The client `VisitEditor` does suggest for those events, so the same event gets different treatment on the add-to-calendar and respond paths. No server test covers an all-day event on the default-suggestion path. Fix: drop the `hoursKnown` check, or change the docs and PRD to say it is skipped.

### Minor
- none beyond the above. `/code-review` and `/security-review` skills were not invoked, so this was a self-review.
