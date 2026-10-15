# Validation: events-visit all-day repair (plan 298)

Base: 9d29cae (PRD file found in prds-archived/). Commit for 298: a5f2390 (touches only server/events-service.ts and server/events-service.test.ts).

## 298-repair-events-visit-default-all-day — VERIFIED
- AC1: `server/events-service.ts:587` is now `if (!day) return;`. The `!day.hoursKnown` early return is gone. The window-length guard remains (`<= visitBlockMinutes + 30`, line ~597); all-day windows are 09:00-17:00 (480 min) so they pass it. The only other `hoursKnown` use (line 266, `assertVisitFits`) is unchanged, as the PRD requires.
- AC2: `server/events-service.test.ts:530` ("default visit for an all-day multi-day event…") uses allDay, 2026-10-15..2026-11-01, no occurrences. It asserts startDate 2026-10-15, endDate === startDate, startTime 10:00, endTime 12:30, and plan.visit 2026-10-15T10:00:00-12:30:00. It passes.
- AC3 (289 behaviour intact), all in the passing run: explicit visit (508), 09:00-19:00 default (519), short event unchanged (547), 400 on invalid or out-of-hours visit (556), updatePlan visit patch (564), schedule-change pinning (577).
- Gate 1: `timeout 300 npx tsx --test server/events-service.test.ts server/events-routes.test.ts server/events-service-routes.test.ts` → 46 tests, 46 pass, 0 fail.
- Gate 2: `timeout 300 npm run check` → tsc clean, exit 0.
- Environment note: the job worktree had no node_modules, so the first gate run failed with ERR_MODULE_NOT_FOUND (zod). I symlinked the main checkout's node_modules into the worktree (untracked, not committed) and re-ran. The results above are from that re-run.

## Combined diff review
`git diff 9d29cae..HEAD --stat`: 23 files, +1743/-72, covering the whole visit-block and day-panel plan; the 298 delta is a 1-line change plus a test. Self-review (`/code-review` and `/security-review` were not run as skills): no new input handling, secrets or path handling in the 298 delta. The visit still goes through `assertVisitFits` when explicit, and the default comes from the pure `suggestVisit`.

## Findings
- Critical: none.
- Important: none.
- Minor: none. The default now applies to all-day events whose hours are unknown, and the client already labels such blocks "Hours not listed – check before you go", so there is no further gap.
