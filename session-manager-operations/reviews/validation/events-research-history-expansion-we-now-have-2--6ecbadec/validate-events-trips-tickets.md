# Validation: events trips and tickets (PRDs 308-319)

Base: 64e00d556027c18c8a5fcf474a980dbd52619d73 (HEAD f91543d). PRD files found in `prds-archived/`.
Gates re-run in the foreground: `npm run check` (clean), `npm run events:check` (clean), `npm run events:test` (188/188 pass),
`npx vitest run client/src/lib/events.test.ts client/src/lib/event-detail.test.ts` (34 pass), `tsx --test server/events-schema.test.ts server/events-profile.test.ts` (23 pass).
Commits per PRD found via `git log 64e00d5..HEAD` (c85d31b, a1fa92f, 8237fd9, fe708f1, c77d34d, 5410112, 3aaac12, 032e84c, 30b5b7e, eb8b831, 3d89351, dbb3cf8).

## 308 events-trip-schema — VERIFIED
- shared/events.ts:174-181 `ADMISSION_KINDS`, `TRIP_TYPES`, costSchema `admission`; :93 `maxActiveTrips: 3`; :341 `tripType`; :373-374 `maxTicketPrice` (0-5000, default 500), `tripsEnabled` default true.
- server/events-schema.test.ts covers valid/invalid trips and defaults (23 tests pass with profile tests); `npm run check` clean.

## 309 events-household-profile — VERIFIED
- shared/events-profile.ts exports `householdProfile`, `PROFILE_GUIDANCE`, `LIFE_STAGES`; server/events-profile.test.ts passes.

## 310 events-drive-time — VERIFIED
- services/events-pipeline/geo.ts:120-128 `TRIP_DRIVE_LIMITS`, `estimateDriveMinutes`, `tripTypeFor`; geo.test.ts included in the 188 passing tests.

## 311 events-admission-normalize — VERIFIED
- normalize.ts `deriveAdmission` (rules in specified order), `event.cost.admission = deriveAdmission(...)`; mergeDuplicate keeps incoming admission.

## 312 events-ticketed-track — VERIFIED
- search.ts: `ticketed-shows` task placed in `near` order right after the first focus entry (:110); prompt carries the price ceiling. rank.ts: "over ticket price limit" skip, ticketed exempt from budget-free skip, "Ticketed show, from <cur> <min>" reason. Tests pass.

## 313 events-trip-labels-profile — VERIFIED
- discover.ts publishes `driveMinutes` and `tripType = tripTypeFor(...) ?? "weekend"` only when distanceKm is set; `profileLines` filled from `householdProfile(memberAges)`; explain.ts prints profile lines and `PROFILE_GUIDANCE`; tests pass.

## 314 events-trip-planner — VERIFIED (privacy included)
- trips.ts `buildTripPrompt` (:117-): inputs are city/region/country, ages-derived profile lines, categories, existing titles, ticket ceiling. No street address, lat/lon, names or birthdays are interpolated; it also instructs the model not to mention them. Caller trips-run.ts:121-128 passes only `address.city/region/country` and `memberAges`.
- `parseTripResult` validates against ffEventSchema and recommendationInputSchema, rejects too-far day trips, caps without home coordinates; `nextTripDates` never returns today.

## 315 events-trip-runs — VERIFIED
- trips-run.ts implements retire / refresh / one-new-per-run / dry-run / tripsEnabled rules; cli.ts runs it only in mode `all` and adds `trips` stats; db.ts `listPublishedForHousehold`. Tests (trips-run.test.ts) pass.

## 316 events-trips-overview-ui — VERIFIED
- client/src/lib/events.ts `isTripIdea`, `matchesTripFilter`, `isPaidOrTicketed`, `tripBadge`; pages/events.tsx filter chips (aria-pressed, min-h-11), "Trip ideas" section above the agenda, trips excluded from month/day panel/agenda groups. vitest passes.

## 317 events-trip-detail-ui — VERIFIED
- event-hero.tsx: trip badge and admission badge, "Plan for the trip", "Where to stay" with the required disclaimer line, external links `target="_blank" rel="noopener noreferrer"` (:48), min-h-11 links.

## 318 events-trips-prefs-ui — VERIFIED
- events-preferences-panel.tsx: "Trips and tickets" section with Switch, $50..$1000 chips, profile lines from People birthdays, hint note; EMPTY_PREFS defaults true/500.

## 319 events-trips-docs — VERIFIED
- docs/events.md documents admission, trip fields, preferences, profile, drive formula/limits, ticketed task, trip pool; CLAUDE.md gains the two bullets only.

## Findings

### Critical
- none

### Important
- none

### Minor
- services/events-pipeline/trips-run.ts:~96 — a trip answered `going` whose end date is today (`end < tomorrow`, not yet `gonePast`) is re-dated to the next Saturday, contradicting "going trips stay" for that one day. Cosmetic, self-corrects next run.
- services/events-pipeline/trips-run.ts — `stats.retired` increments for every already-retired trip on every run (counts repeat), so it is not a count of newly retired trips.
- Combined-diff self-review (`/code-review`, `/security-review` not invoked as separate tools): no secrets, no unsafe input handling, external links use noopener, lodging/source URLs forced https by schema, no duplicated helper found.
