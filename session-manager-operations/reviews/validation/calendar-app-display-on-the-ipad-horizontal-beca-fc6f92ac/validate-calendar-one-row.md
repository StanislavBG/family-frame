# Validation: calendar-upcoming-one-row (PRD 283)

Base: 432264625a20afab46a3929da49166aa164f354e. Commit: 5db313d (only commit touching the PRD's files; 2 files, +144/-82).

## calendar-upcoming-one-row — VERIFIED

Gate (re-run in foreground, after `npm ci`): `timeout 300 npm run check` exit 0; `timeout 600 npm test` exit 0 (node:test 464 pass, 0 fail; vitest part included in exit code).

Criteria:
1. `export function UpcomingEventsStrip({events, people, timeFormat, onSelect})` at `client/src/pages/calendar.tsx:283`; empty state "No upcoming events" at :370; used by CalendarPage at :1013; testids `upcoming-event-`, `text-event-time-`, `badge-cancelled-` preserved (diff shows identical markup moved).
2. Row container `flex flex-nowrap gap-2 items-stretch overflow-x-auto snap-x` (:296); cards `w-[220px] flex-shrink-0 snap-start`; strip Card keeps `flex-shrink-0` (:1011). No `flex-wrap` remains in the strip.
3. `gridTemplateRows: repeat(${totalRows}, minmax(0, 1fr))` (:196); grid div `flex-1 min-h-0 overflow-hidden` (:195); outer div `h-full min-h-0 flex flex-col` (:176); day cells `overflow-hidden` (:233); calendar Card `flex-1 flex flex-col min-h-0 overflow-hidden` (:586).
4. `client/src/pages/calendar-layout.test.ts`: uses renderToStaticMarkup + React.createElement (no JSX, no new deps); asserts 7 testids, `flex-nowrap`, `overflow-x-auto`, no `flex-wrap`; empty state test. Passes.
5. check and test green (above).

## Findings

Critical: none.

Important: none.

Minor:
- `client/src/pages/calendar-layout.test.ts:16` sets `globalThis.React` and uses a dynamic import as a workaround for the classic JSX runtime; acceptable given `vitest.config.ts` was out of the PRD's file list, but fragile if other tests share the global.
- `client/src/pages/calendar.tsx:290` the fragment wrapper has mis-indented body (cosmetic).
- No visual check at 1180x820 / 1024x768 was done by the implementer; layout is covered only by class-string assertions. Not verified here either.
- Self-review of the diff: no input handling, secrets or path concerns; no helper duplication (card markup was moved, not copied).
