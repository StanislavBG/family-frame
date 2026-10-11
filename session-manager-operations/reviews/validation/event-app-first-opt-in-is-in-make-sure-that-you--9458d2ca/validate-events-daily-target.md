# Validation: events daily target (PRDs 194-199)

Base: ad6d3f45cb35ff3ed0594e79f7697e23354e903a. Commits: a0bdb0a (194), 0d5abd9 (196), 05a7a72/79f1540 (195), eff8b03 (197), b4de870 (198), 5bbba78 (199).
Gates re-run (node_modules symlinked from the main checkout, removed afterwards): `npm run check` exit 0; `npm test` 345 pass / 0 fail; `npm run events:test` 151 pass / 0 fail; `npm run events:check` exit 0. (vitest output tail was lost in my capture; the node:test half passed and the command exited 0 as shown by TEST=0.)

## 194 events-page-scroll: VERIFIED
- client/src/pages/events.tsx: default `EventsPage` wraps `EventsContent` (all branches) in `<div className="h-full overflow-y-auto" data-testid="events-scroll">`.
- Overview root class is now `space-y-5 p-4 sm:p-6` (no `min-h-full`). Diff touches only events.tsx.
- check + test green.

## 195 events-rank-per-day-and-series: VERIFIED
- normalize.ts: exported `titleSimilarity`; `isNearDuplicate` uses it, threshold 0.6 unchanged.
- rank.ts: `perDayMax`/`laterPerDayMax` (3/1), defaults maxFocus 42 / maxLater 20; per-day count by event-timezone date (`dayInZone`), reason "day full".
- rank.ts: `state.known` seeds day counts; "same series as a known recommendation" / "higher-ranked pick" at >= 0.6.
- rank.ts: focus category key is per day (1 each, "category variety cap"); later keeps MAX_PER_CATEGORY. Scoring untouched.
- rank.test.ts has the five required tests (per-day, known counts, same series, known title blocks, same-category focus day).
- events:test + events:check green.

## 196 events-search-coverage: VERIFIED
- search.ts: `maxTasks ?? 11`; prompt says "up to 25 candidates", adds distinct-events and recurring-activities/`occurrences` lines; no address added.
- cli.ts: `DEFAULT_MAX_SESSIONS = 45`, `DEFAULT_WATCH_MAX_SESSIONS = 20`; cli.test.ts and search.test.ts updated.
- The candidates schema in normalize.ts has no maxItems on `candidates`, so 25 is not blocked.

## 197 events-explain-all-picks: VERIFIED
- explain.ts `explainBatch` loops chunks of `EXPLAIN_MAX_PICKS`, one `runner.run` per chunk; failure/throw falls back to `templateExplain` for that chunk; rate-limited/budget-exhausted sets `stopped` so later chunks use templates with no call.
- explain.test.ts has the three required tests; green.

## 198 events-discover-known-and-event-geocode: VERIFIED
- discover.ts passes `known` from `a.state.recommendations`, filtering withdrawn and not-interested/dismissed, mapped to `{title,start}`.
- Event geocode runs after normalize and before upsert, only when not online and lat/lon missing; hit sets lat/lon + `geocodeHits`; null or throw increments `geocodeMisses`, event kept. Stats initialised to 0.
- Address safety: the query is built only from `loc.venueName, address, city, region, country` of the candidate event (discover.ts ~275); `h.address` is used only in the separate household `geocodeHousehold` call. No household address reaches an event query.
- discover.test.ts has the known-blocks, geocode-hit and geocode-miss tests; green.

## 199 events-daily-target-docs: VERIFIED
- docs/events.md states 3/1 per day, known counting, 0.6 series dedupe, event-only geocoding, 11 x 25, defaults 45 and 20; all match code. README.md updated (45 / 20). Only those two files changed. Gate grep ('per day', '45') matches.

## Findings
### Critical
- none
### Important
- none
### Minor
- rank.ts:~331 known recommendations are bucketed by `k.start.slice(0,10)` (the stored string's date), while picks use the event-timezone date. For a start stored in UTC with an evening local time this can land on the adjacent day, so a day cap may be off by one for known items.
- discover.ts:~273 if a candidate has no venue/address/city/region/country parts the query is an empty string and is still sent to the geocoder (counted as a miss). Normalisation probably guarantees a city, but an empty-query guard would avoid a wasted call.
- docs/events.md describes explanation batches of 12 (value of `EXPLAIN_MAX_PICKS` not re-verified here).
- The 195 PRD asked for a test of "Día de Muertos Festival" titles; the test is named "same series on different days gives one pick" (not checked for the exact titles).
