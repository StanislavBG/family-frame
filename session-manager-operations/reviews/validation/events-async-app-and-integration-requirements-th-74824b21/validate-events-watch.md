# Validation: new address triggers a job (PRDs 175-178)

Base: e1c5f6f (from the validation PRD). Commits in range: e0e1da3 (175), fa6b6b3 (176), 65429bb (177), ae75f4e (178). PRD files found in `prds-archived/`.

Gate environment note: the job worktree has no `node_modules`; I symlinked the main checkout's `node_modules` (untracked, git-ignored) to run commands. Commands run on the worktree sources.

Gate results (all re-run, foreground): `npm run events:check` rc=0; `npm run events:test` 108/108 pass; `npm run check` rc=0; `npm test` (vitest + server) rc=0, 341 server tests pass; `npm run build` rc=0.

## 175-events-pipeline-watch — VERIFIED
- db.ts:7 SCHEMA_VERSION=3; db.ts:82-85 idempotent ALTER (only when column missing) for last_discovered_at / last_triggered_at; db.ts:~231/236 `markHouseholdTriggered` / `markHouseholdDiscovered`; `listHouseholds` returns `lastDiscoveredAt`/`lastTriggeredAt` (db.ts:225-226).
- discover.ts:84 exports `addressHashOf` (hashOf aliases it); discover.ts:346 calls `markHouseholdDiscovered` after publish / dry-run print, inside the per-household try.
- watch.ts:27 `findPendingHouseholds`: new / address-changed / never-discovered, 30-min cooldown, maxPerTick 3, oldest-triggered first (null first), `deferred` counted.
- watch.ts:83 `runWatch`: one `ff.listHouseholds()`, per pending household `markHouseholdTriggered` then `runDiscover({ onlyHouseholdId })`, per-household try/catch. Idle tick: the `for` loop never runs, so runner and geocoder are never referenced. Test `watch.test.ts:114` asserts one list call and zero runner/geocoder calls.
- watch.test.ts covers every listed case incl. migration twice (line 156). Gate green.

## 176-events-first-suggestions-copy — VERIFIED
- events.tsx:281 waiting copy matches exactly.
- settings.tsx:632-639 shows next-step sentence + `<Link href="/events">` when `eventsSharing.enabled`.
- household.ts:81-85 toasts match both required strings (done in the shared `useSetEventsSharing` onSuccess; no other behaviour changed). Existing tokens only (`text-muted-foreground`, `text-primary`).
- `npm run check`, `npm test`, `npm run build` green.

## 177-events-pipeline-watch-cli — VERIFIED
- cli.ts:17-31 MODES/Mode/USAGE include watch; default maxSessions 12 for watch (cli.ts:56); `--dry-run` passed through.
- Lock acquired before the mode branch (shared with discover/refresh/all); lock-held test cli.test.ts:128 expects exit 0 and `{"skipped":"locked"}`.
- cli.ts:229-249 lazy runner/geocoder wrappers; no-pending test cli.test.ts:144 asserts neither is built; prints one JSON line `{mode,listed,pending,deferred,runs}`, rc 0; FF error test cli.test.ts:191 exit 1. Run row recorded only when `runs.length > 0` and not dry-run.
- crontab.example: exactly two jobs, `*/5` watch and `30 5` all, with the required comments and log paths; old lines removed.
- README.md: schedule text updated; "New households" section present (5 min, 30-min cooldown, 3 per tick, daily 05:30).
- Root exclusion intact: root tsconfig include is client/shared/server only and excludes `*.test.ts`; vitest include is `client/src/**`; root test script globs `server/*.test.ts`. package.json unchanged. Root `check` and `test` green.

## 178-events-docs-watch — VERIFIED
- docs/events.md §8 describes both cron jobs, triggers, 30-min cooldown, 3 per tick, idle tick = no Claude session (does not say "one HTTPS request" literally; README does). No mention of twice-daily discover or 6-hourly refresh (grep clean on docs/events.md and README).
- CLAUDE.md:253 adds the required line.
- Diff touches no code files for this PRD (docs/events.md, CLAUDE.md only).

## Findings

Critical: none.

Important: none.

Minor
1. services/events-pipeline/discover.ts:346 — `markHouseholdDiscovered` is set even if search/explain errors were counted (`stats.errors`) and zero events were published, as the PRD specifies. A household whose discovery silently failed (e.g. Haiku budget exhausted) is therefore not retried by watch until the daily run.
2. services/events-pipeline/watch.ts — after an address change, `runDiscover`'s upsert rewrites the stored address hash before discovery completes; if discovery then throws, the household is no longer "address-changed" and `last_discovered_at` is still non-null from before, so watch will not retry (daily run picks it up). Resetting `last_discovered_at` on hash change would close this.
3. docs/events.md §8 omits the explicit "idle tick = one HTTPS request" wording the 178 criterion lists (meaning is covered: no Claude session; the README states the one-request cost).
4. watch.ts comment "Mark before and after" matches behaviour (second mark covers the new-household case); no defect.

Self-review (code-review/security-review skills not run; diff reviewed manually): no secrets, no new input paths, SQL uses bound parameters, the interpolated column names in db.ts are a fixed literal list, no path handling added.
