# Validation: calendar-day-view plan

Base: 59e6ccd. Commits da1fdaa, a9aa1d4, 25c3cdc, 888d438, 0b42be6, f2e948e. node_modules was symlinked from the main checkout (gitignored) so gates could run.
Gates re-run: targeted vitest (4 files, 27 tests) green; full `npx vitest run` (20 files, 234 tests) green; `npm run check` (tsc) exit 0.

## calendar-upcoming-fit-row — VERIFIED
- fitCount: client/src/lib/fit-scale.ts:19-22 (floor((w+gap)/(item+gap)), min 1, 1 for 0/NaN/negative). Tests in fit-scale.test.ts pass.
- Strip measures with ResizeObserver, guarded for undefined; `width === null ? events : slice(0, fitCount(width, 220, 8))`: calendar.tsx:288-315.
- Row `flex flex-nowrap gap-2 items-stretch overflow-hidden` at :320; no snap-/overflow-x-auto in the strip (remaining flex-wrap hits at :770,:932 are in the event forms).
- `.slice(0, 20)` at :626. calendar-layout.test.ts passes.

## calendar-day-layout — VERIFIED
- layoutCalendarDay, formatTimeOfDay, formatHourLabel exported from client/src/lib/calendar-day.ts; calendar-day.test.ts passes (selection, multi-day, clusters, hour range, birthdays, formats).

## calendar-day-view-component — VERIFIED
- CalendarDayView in client/src/components/calendar/calendar-day-view.tsx: HOUR_PX=56 (:12), testids button-day-back/prev/next, text-day-title, day-all-day (:158), day-slot-HH (:204), day-event-<id> (:182,:233), 60s now-line interval (:81), day-plan (:257) with the empty-plan message (:260), line-through on cancelled. calendar-day-view.test.ts passes.

## calendar-day-view-wire — VERIFIED
- shared/apps.ts:93 calendar `nested: true`; app-manifest.test.ts:61 asserts true.
- calendar.tsx:408 `useRoute("/day/:date")`, isValidIsoDate round-trip (:78), invalid date redirects via setLocation("/"); handleDateClick -> `/day/<iso>` (:589); onNavigate `/day/<iso>`; handleDayBack sets currentDate to first of month and goes to "/".
- Dialogs: create/edit/delete are extracted into one `dialogs` fragment (:630-1023) rendered in both the day branch (:1042) and month branch. onSelectEvent=handleEditEvent; onCreateAt=handleCreateAt (:593) sets startDate/endDate=day, endTime=plusOneHour capped 23:59 (:84), empty when no time.
- `~/settings` (:650) and `~/events/<refId>` (:959) links; formatTimeOfDay replaces formatEventTime; useToday used (:409).
- Dialog behaviour was checked by reading code and by the passing suite; not exercised in a live browser.

## calendar-day-view-doc — VERIFIED
- CLAUDE.md: Calendar bullet mentions Day view; tree lists components/calendar/ and lib/calendar-day.ts; `### Calendar Day view` has 4 bullets covering route + `~/`, logic location, no auto-created events, fitCount one-row strip.

## Findings
### Critical
- none
### Important
- none
### Minor
- client/src/pages/calendar.tsx:593-601,1063: handleCreateAt writes the day's date/time into the shared create form; if the user cancels that dialog, the next month-view "New Event" opens with the stale prefilled dates (the form is only reset after a successful submit, :489).
- Missing-file check: all five PRD files were found in prds-archived/; none missing.
