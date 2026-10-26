# Validation: close-to-home tag plan

Base: b7ce924c31f2e65a83aae9c5c7b604aead47495c (HEAD cfda3c7). Commits per PRD: b0a6824 (helper), 2e92881 (normalize), 15726c4 (items), 117d210 (filter), be8186a (badges), 148e409 (search), 61d5153 (rank), cfda3c7 (docs). /code-review and /security-review were not run as separate tools; the combined diff was self-reviewed (see Findings).

Gates re-run in the foreground, all exit 0: `npm run check`; `tsx --test server/events-proximity.test.ts` (8/8); `npm run events:check`; `npm run events:test` (198/198); `npm test` (528/528 node tests); `vitest run client/src/lib/events.test.ts` (28/28); `npm run build`.

## close-to-home-helper — VERIFIED
- shared/events-proximity.ts:10-11 constants 5 / 8.05; exports canonicalCity/canonicalCountry/sameCity/isCloseToHome; header comment states the rule (lines 1-8).
- isCloseToHome false for online/trip, true at <= 8.05 km, true when home set and sameCity (read in file).
- services/events-pipeline/geo.ts now imports canonicalCity/canonicalCountry from shared (geo.ts diff -39 lines); events:test (incl. geo tests) green.
- server/events-proximity.test.ts 8 tests pass.

## normalize-ongoing-candidates — VERIFIED
- normalize.ts upcoming-occurrence rule: past start with upcoming occurrences moves start/end to first upcoming; ongoing window with end >= now keeps original; otherwise rejects 'start date is in the past'.
- clipText (normalize.ts ~279) clips recurrenceText to <= 200 at a word boundary with an ellipsis.
- normalize.test.ts +48 lines cover the four rules; events:test green.

## items-close-to-home — VERIFIED
- server/apps/events.ts withCloseToHome (line ~58) uses isCloseToHome with distanceKm, online, tripIdea = rec.trip != null, event.location, home from profile.address; both GET item routes use Promise.all with profiles.getProfile.
- No address leak: only the boolean is added (`{ ...item, closeToHome }`); address.line1/postalCode are never read; home is passed as city/region/country only.
- No address -> home null, distance rule only. events-routes.test.ts +39 lines; npm test green.

## events-close-filter — VERIFIED
- client/src/lib/events.ts: EventItem.closeToHome?, TripFilter 'close', matchesTripFilter close === true only.
- client/src/pages/events.tsx: first TRIP_FILTERS entry "Close to home"; caption testid events-close-caption from CLOSE_TO_HOME_MILES; AgendaCard leaf ToneChip testid events-close-<id>.
- events.test.ts passes (28).

## close-badge-panel-hero — VERIFIED
- events-day-panel.tsx: leaf chip testid events-day-close-<id> when closeToHome === true.
- event-hero.tsx: chip testid event-hero-close with "· X.X km" when distanceKm set; the plain distance span is hidden only in that case. Non-close items unchanged. Build green.

## close-to-home-search — VERIFIED
- search.ts: CLOSE_CATEGORY_KEY; planned after the general focus task and after the ticketed task in near; categories = non-avoided EVENT_CATEGORIES; default maxTasks 13.
- Prompt opens with "…in <place> itself or within about 5 miles (8 km) of it." and adds the Focus lines; other tasks unchanged (isClose branch only).
- No street address: the prompt uses area.city/region/country only; grep of search.ts for line1/postalCode is empty. (The prompt asks the model to return a venue's address; that is the venue, not the household.)
- search.test.ts passes.

## rank-close-allowance — VERIFIED
- rank.ts: place?, closeToHome on RankPick, new limits with defaults 2/1/28/15, window counter and ':close' variety key, 'Close to home' unshifted first.
- discover.ts passes place as city, region?, country only; stats.closeToHome added and summed. rank.test.ts +57 and discover.test.ts green.

## close-to-home-docs — VERIFIED
- docs/events.md and CLAUDE.md match the code: 5 mi / 8.05 km, read-time derivation, 13 tasks, +2/+1 allowance, closeToHome stat, feedbackEntrySchema read rule; CLAUDE.md has the two bullets.

## Findings
### Critical
- none
### Important
- none
### Minor
- shared/events-proximity.ts / client: 'Close to home' chip in event-hero.tsx hardcodes the distance in km while the caption says miles; the PRD asked for km, so left as is.
- server/apps/events.ts:~58 `withCloseToHome` types rec/event as `any`; a narrower type would be safer.
- search.ts prompt uses Math.round(8.05) = 8, so the "8 km" is rounded from CLOSE_TO_HOME_KM; fine but not exact.
