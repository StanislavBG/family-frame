# Validation: events-app-filters PRDs 365-374

Base: 57b57f52 (HEAD reviewed: 5a13e42). All PRD files found in prds-archived/. Self-review used for diff (correctness, SSRF/URL handling, no secrets).

Gates re-run: `tsx --test server/events-activity.test.ts server/events-service-routes.test.ts` 17/17 pass; `npm run check` exit 0; `npm run events:check` exit 0; `npm run events:test` 225/225 pass.

**ffEventSchema check: CLEAN.** `git diff 57b57f5..HEAD -- shared/events.ts` is empty. Pipeline adds only `cost.registrationUrl` (already in the strict schema, shared/events.ts:189 at base) and the existing `tags` array (reserved tag `class`). `isClass` exists only on the raw candidate, never on FfEvent.

## events-activity-helpers — VERIFIED
shared/events-activity.ts (new, 103 lines) exports the helpers; memberAgesFrom now calls ageOn (server/events-service-routes.ts:31-37); events-activity.test.ts + routes tests pass.

## events-session-budgets — VERIFIED
cli.ts builds discover/refresh/trips runners separately (cli.ts ~369-372); addUsage sums (cli.ts:148); trips wrapped in try/catch so exit code unaffected; notify.ts adds trips summary and "Events trip ideas failed" normal notice; tests pass.

## events-registration-url — VERIFIED
normalize.ts registrationUrl in zod + JSON schema; cost mapping `registrationRequired ?? !!registrationUrl`; mergeDuplicate keeps either URL; search.ts rule line added.

## events-recheck-signup-link — VERIFIED
dispatch.ts: schema + prompt gated on needsSignUp && no stored URL; https-only, try/catch URL parse, never overwrites; no updates entry; changed=true so event is pushed (dispatch.ts ~253-281, caller 352-357).

## events-class-flag — VERIFIED
isClass in both schemas; withClassTag puts class first before slice (normalize.ts:26-32); merge preserves it; search rules for isClass and real first-session date (search.ts ~230-234).

## events-class-identity — VERIFIED
fingerprint omits date for class-tagged (normalize.ts:253-260); isNearDuplicate 0.8 city-only for classes; windowEndMs-based schedule merge; tests pass.

## events-class-window-push — VERIFIED
pushEvent exported (dispatch.ts:297); discover.ts:313-319 pushes merged class when schedule JSON differs, not on dryRun, failures added to stats.errors.

## events-classes-search — VERIFIED
CLASSES_CATEGORY_KEY, planned after close entries in focus and near, maxTasks 15; prompt opens without "family-friendly", names adults/parent-child/child ages, session dates/recurrenceText/registrationUrl/ageBands; no address (search.ts 83-125, 183-210).

## events-rank-classes — VERIFIED
rank.ts: isClass on picks, limits 8/4/40, own counters, no perDay, known classes excluded from perDay, 0.8 similarity, 'class pool full', reason added; discover.ts drops ended class recs from known and adds stats.classes.

## events-pipeline-docs — VERIFIED
docs/events.md covers separate budgets, trips notice, classes-lessons/15 tasks/isClass rule, class tag with strict-schema/Replit rationale, date-free identity, window push, class limits, registrationUrl + silent backfill; README cost caps corrected.

## Findings
- Critical: none. Important: none.
- Minor: dispatch.ts ~353 — a silent sign-up backfill increments `stats.changed` (and pushes) though no Changed flag is set; counts in run stats slightly overstate real changes.
- Minor: docs/events.md "Class ranking" says window-full reasons are `focus window full`/`later window full`; rank.ts uses `${window} window full` — consistent, no action.
