# Validation: events-daily-time-limit, events-recheck-priority

Base: e9a70a8 (commits e8c5b39, 6fb2f02, merge b34c019). PRDs read from prds-archived/403-*, 404-*.

## events-daily-time-limit — VERIFIED
- Daily unit `TimeoutStartSec=240min`: systemd/family-frame-events-daily.service:15; watch unit still 80min (family-frame-events-watch.service:15).
- `LOCK_STALE_MS = 4.5 * 3600000`: cli.ts:18; comment at cli.ts:99 says 4.5 h.
- cli.test.ts "stale lock is replaced": 4 h-old lock -> acquireLock null; 5 h-old -> replaced.
- docs/events.md:234 and services/events-pipeline/README.md:57 state 4.5 h stale and 4 h daily limit.
- No other behaviour changed (diff limited to the 5 listed files).
- Gate: `events:check` rc 0; `events:test` 229/229 pass; grep TimeoutStartSec=240min ok.

## events-recheck-priority — VERIFIED
- `listDueForRecheck(db, nowIso, limit)` signature and WHERE (`next_check_at <= ? AND status NOT IN ('ended','cancelled')`) unchanged: db.ts ~213-220.
- Rank 0 held+upcoming, 1 upcoming, 2 rest; sort rank, next_check_at, id: db.ts ~224-230.
- `isStillToCome` checks schedule.end, start, occurrence start/end by `slice(0,10)` vs now date (handles date-only): db.ts ~199-204.
- Limit applied after sort (`slice`): db.ts ~231.
- Existing test 'orders by next_check_at and skips ended/cancelled' passes (full suite 229/229).
- New test db.test.ts:111 covers held before older unheld, unheld upcoming before held past, past start with later occurrence, date-only, limit.
- Gate: `events:check` rc 0; `events:test` pass.

## Publish check
`git diff e9a70a8..HEAD --stat -- shared/events.ts client` is empty: both unchanged, no Replit Publish needed for this plan (pipeline/docs/systemd only).

## Review
Diff is 7 files, pipeline-local. No input-handling, secret or path concerns; `JSON.parse` of the local DB's own rows only. /code-review and /security-review not run separately; self-reviewed.

## Findings
- Critical: none.
- Important: none.
- Minor: db.ts `listDueForRecheck` loads all due rows (hundreds) and parses JSON each call; acceptable per PRD. cli.ts:402 dry-run count also now pays this cost.
