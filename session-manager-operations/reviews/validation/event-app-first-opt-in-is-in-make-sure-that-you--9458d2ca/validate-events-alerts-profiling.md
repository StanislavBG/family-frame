# Validation: events alerts + profiling (PRDs 181-188)

Base: eb0ae82134be92f0033eaf864233329743583a1d. Commits: b24fd8e (181), 11fffcf (182), 480f5bf (183), 168b318 (184), 4f02a7d (185), 5e97fd7 (186), 1b0dfa0 (187), b86e64d (188).
Note: the job worktree has no node_modules; I symlinked the main checkout's (git-ignored, no tracked change) to run the gates.

## Gate runs (all exit 0)
- `npx tsx --test server/auth.test.ts server/service-token.test.ts`: 40 pass, 0 fail
- `npm run check`: clean
- `npm test`: vitest 91 pass; node:test server suite 345 pass, 0 fail
- `npm run events:test`: 138 pass, 0 fail
- `npm run events:check`: clean
- 188 grep gate: exit 0

## Verdicts
- 181 events-service-api-503-when-unconfigured: VERIFIED. `isServiceTokenHashConfigured` in server/service-token.ts reuses HASH_PATTERN. server/auth.ts:117 returns 503 `Service API not configured` before token verification. server/index.ts:69 wires the dep. New auth tests pass.
- 182 events-haiku-usage-meter: VERIFIED. haiku.ts exports HaikuUsage and MeteredHaikuRunner. `refuse()` counts refused calls, `record()` counts sessions, ok, failures, cost and ms. `usage()` returns a copy with a copied `failures`. Tests in haiku.test.ts pass.
- 183 events-discover-funnel-stats: VERIFIED. The new DiscoverStats fields and the injectable `clock` are in discover.ts, with the new test in discover.test.ts. Events tests are green.
- 184 events-notify-primitive: VERIFIED. notify.ts exports planNotices, loadJobState, saveJobState and sendNotice, with notify.test.ts covering cases a-f, the 24h boundary, the db round-trip and EVENTS_NOTIFY=off.
- 185 events-report-primitive: VERIFIED. report.ts has the Runs, loss-funnel and Recommendations sections. report.test.ts seeds a street, addressHash, lat and lon and asserts none appear in the output (privacy test).
- 186 events-cli-profile-and-report: VERIFIED. cli.ts has the `report` mode (cli.ts:258, no FF config needed), `--runs` validation, and `haiku` in stats for discover, refresh and watch. Tests are green.
- 187 events-cli-notify-wire: VERIFIED. `notifyOutcome` (cli.ts:176) is wrapped so it never throws. It is called after watch (cli.ts:306) and after discover/refresh/all (cli.ts:371), skipped on dry run. The catch path (cli.ts:392) notifies when the db is open and the run is not a dry run. Tests with a capturing notify pass.
- 188 events-alerts-profiling-docs: VERIFIED. docs/events.md, services/events-pipeline/README.md and CLAUDE.md contain the required text (grep gate exit 0). The CLAUDE.md diff is one bullet, as specified. The docs match the landed code (503/401, report mode, EVENTS_NOTIFY=off).

## Findings
### Critical
- none
### Important
- none
### Minor
- Neither `/code-review` nor `/security-review` was run; I self-reviewed the diff. No secrets, path traversal or token logging found. The 503 reveals only that the service API is disabled. Notices carry only ids, counts, cost and error text.
- Haiku `refused` also counts the "stopped after rate limit" short-circuit (haiku.ts), which is reasonable. The PRD only named the session cap and forbidden tools.
