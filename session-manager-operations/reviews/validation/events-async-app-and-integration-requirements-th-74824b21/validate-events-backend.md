# Validation: events backend plan

Base: `3f64d8ee7862d35ef63527ea6e1bec937458dfa9` (HEAD `fd6e848`). All nine PRD files found in `prds-archived/` (137 under a timestamped subfolder).

Environment note: the job worktree had no `node_modules`; I symlinked the main checkout's `node_modules` (git-ignored, not committed) so gates could run.

## Gates re-run (foreground)
- `npx tsx --test server/events-schema.test.ts server/calendar-service.test.ts server/mcp.test.ts server/auth.test.ts server/service-token.test.ts server/events-preferences.test.ts server/events-service.test.ts` → 112 pass, 0 fail.
- `npm run check` (tsc) → exit 0.
- `npm test` → vitest 86/86 pass; node:test 328 pass, 0 fail.
- Gates for 138/143/149/153/154 are `npm test && npm run check` or subsets of the above; all green.

## 131-events-schema — VERIFIED
- `shared/events.ts` (464 lines) holds the constants, schemas and `SAMPLE_EVENT` / `SAMPLE_RECOMMENDATION_INPUT`; commit 15ff650.
- `server/events-schema.test.ts` (71 lines) covers the listed rejections; passes. tsc clean.

## 132-calendar-event-details-and-links — VERIFIED
- `shared/schema.ts:58-64` `insertCalendarEventSchema` omits `source` and `cancelled`.
- `server/calendar-service.ts:49` copies the optional fields only when present; `:117-127` `createEvent` takes `{source}`; `:157` `updateEvent` keeps the existing `source`; `:166` `setLinkedFields` exported.
- 65 new test lines in `calendar-service.test.ts`; passes. Commit 483e25f.

## 133-service-token-auth — VERIFIED
- `server/service-token.ts:12-20` checks hash format, prefix, 43-char body and compares with `timingSafeEqual`; unset or blank hash returns false.
- `server/auth.ts` service branch: invalid token gives 401 "Invalid service token"; valid token outside `/api/service/events/` gives 403; valid token on an allowed path sets only `x-ff-auth=service`. `x-ff-auth` and the identity headers are deleted from every request first, so spoofing is impossible.
- `auth.ts` `isServicePath` (case-insensitive) returns 403 for PAT and session requests on `/api/service*`. The PAT allowlist does not include `/api/service`.
- `server/index.ts` wires `EVENTS_SERVICE_TOKEN_SHA256` and `/api/service` JSON parsing (2mb).
- Tests (`auth.test.ts:306-370`) cover valid, invalid, wrong path, unset hash, PAT, session and spoofed/mixed-case paths.

## 137-events-preferences-aggregate — VERIFIED
- `shared/events-preferences.ts` (170 lines) exports `aggregatePreferences`; tests in `server/events-preferences.test.ts` (5 criteria) pass.

## 138-events-store-service — VERIFIED
- `server/events-service.ts`: `EventsError`, `createEventsService`, prune after 30 days (`:121`, `:353`), 409 over `maxActivePerHousehold` (`:359-360`); list/get/withdraw/markSeen/recordRun present. `events-service.test.ts` passes.

## 143-events-feedback-and-preferences — VERIFIED
- `appendFeedback`, `appendResponseFeedback`, `listFeedback`, `getPreferences`, `putPreferences` and `deleteAllForHousehold` are in `events-service.ts` and covered by tests.

## 149-events-respond-and-calendar-sync — VERIFIED
- `respond`, `updatePlan`, `listBusy` and the upsert-time calendar sync are in `events-service.ts` (calendar link create/update/delete, cancellation, no-recreate on 403/404). `events-service.test.ts` has 555 lines with fake calendar deps; `npm test` is green.

## 153-events-household-routes — VERIFIED
- `server/apps/events.ts:61-127` registers the 11 routes in the specified order; `routes.ts` registers them next to calendar; snapshot adds the 11 `/api/events/*` routes.
- The snapshot also adds 3 `/api/household/*` routes. These come from the earlier household plan (commit 67300e1), not this plan.
- `events-routes.test.ts` passes.

## 154-events-service-api-routes — VERIFIED
- `server/events-service-routes.ts`: `guarded()` returns 403 unless `x-ff-auth === 'service'`. `household()` re-checks `listSharingHouseholds()` on every per-household route and returns 404 "Household not found" when not sharing. The response is the same whether or not the user exists.
- The households list returns `memberAges` via `memberAgesFrom`; no birthdays or names are included (`:96-112`).
- A PAT or session request can never reach `/api/service/events/`: `auth.ts` returns 403 before routing, and the route guard rechecks the header. Tests: `events-service-routes.test.ts:63` (session and pat), `:73` (opted-out 404 on all four per-household routes), plus `auth.test.ts:346-370`.
- Snapshot adds exactly the 5 service routes. All tests pass.

## Review of combined diff
`/code-review` and `/security-review` were not run as separate skill calls. I self-reviewed `auth.ts`, `service-token.ts`, `events-service-routes.ts` and `index.ts` for auth bypass, path handling (case, trailing slash, `/api/service` exact), timing-safe comparison, secret handling (hash only, no plaintext) and PII exposure.

## Findings
### Critical
- none
### Important
- none
### Minor
- `server/events-service-routes.ts:96-112`: `GET households` loads feedback (up to 5000) and run meta per household in parallel with no cap on household count. Fine at the current scale, but it is an N+1 against Firebase.
- `server/events-service-routes.ts:129-137`: `state` calls `listFeedback` twice (once filtered by `since`, once full for `learned`). A single read could be filtered in memory.
- `server/auth.ts`: a service token on `/api/service/events/` skips the PAT and session branches. This is intended, and the route guard also requires `x-ff-auth=service`.
