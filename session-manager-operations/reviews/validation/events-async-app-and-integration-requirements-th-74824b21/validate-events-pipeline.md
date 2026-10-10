# Validation: local events pipeline

Base: 3f64d8ee7862d35ef63527ea6e1bec937458dfa9. PRD files found in `prds-archived/` for all 12 slugs.
Note: the job worktree had no `node_modules`; I symlinked the main checkout's (git-ignored) `node_modules` to run the gates.

## Gate results (re-run, foreground)
- `npm run events:check` -> exit 0 (tsc, Node v22.22.1)
- `npm run events:test` -> exit 0, 92 tests, 92 pass, 0 fail
- `npm run check` (root) -> exit 0
- Root isolation: `package.json:10-15` root `check` stays `tsc`, `test` stays `vitest run && tsx --test server/*.test.ts`; root `tsconfig.json:2` includes only client/shared/server, so `services/events-pipeline` is excluded from root test/check. Own scripts `events:check|test|run` at `package.json:13-15`.

## Per-PRD verdicts
- **140-events-pipeline-db: VERIFIED.** `db.ts`, `db.test.ts`, `node-sqlite.d.ts`, `tsconfig.json` (extends root, includes pipeline + shared) present; scripts at `package.json:13-15`; db tests pass in the 92.
- **144-events-pipeline-normalize: VERIFIED.** `normalize.ts`/`normalize.test.ts` present; tests (https, past start, HTML strip, fingerprint, merge) pass.
- **145-events-pipeline-haiku-runner: VERIFIED.** `haiku.ts:6` `HAIKU_MODEL = claude-haiku-4-5-20251001`; argv `haiku.ts:114-123` has `-p`, `--model HAIKU_MODEL`, `--output-format json`, `--json-schema`, `--tools`, `--no-session-persistence`, `--strict-mcp-config`, `--permission-mode dontAsk`; prompt on stdin `haiku.ts:179-180`; no `--bare` flag in args (only mentioned in a comment, `haiku.ts:4`); Bash/Edit/Write rejected `haiku.ts:56,111`; SIGTERM then SIGKILL `haiku.ts:147-148`. It is the only `claude` spawn site in the pipeline (grep).
- **146-events-pipeline-geo: VERIFIED.** `geo.ts`/`geo.test.ts` present, tests pass (cache, fallback order, spacing, haversine, areaKey).
- **147-events-pipeline-rank: VERIFIED.** `rank.ts`/`rank.test.ts` present, tests pass.
- **150-events-pipeline-search: VERIFIED.** `buildSearchPrompt` (`search.ts:154-`) uses `area.city/region/country` + radius only (`search.ts:160`); `SearchArea` (`search.ts:42-`) has no street field; test asserts no line1 even when supplied. No prompt builder includes a street address (search.ts, explain.ts:151 explicitly forbids names/addresses; discover.ts passes only city/region/country and age bands as the audience hint, `discover.ts:201-203,290`).
- **151-events-pipeline-explain: VERIFIED.** `explain.ts`/tests present; digest carries city, ages, categories, preference lines only.
- **157-events-pipeline-ff-client: VERIFIED.** https guard `ff-client.ts:118-120`; 404 -> `{ notSharing: true }` `ff-client.ts:208`; tests pass (retry, 4xx no retry, batch split, validation).
- **161-events-pipeline-dispatcher: VERIFIED.** `dispatch.ts` pushes via `ff.putRecommendations` (`dispatch.ts:224`); tests (cadence, cancellation to two households, rate-limit stop, notSharing purge) pass.
- **163-events-pipeline-discover: VERIFIED.** `discover.ts` lists households, purges, upserts, reads state before search (`discover.ts:123-`); tests (purge, state-before-search, merge, busy clash, dryRun, rate-limit publish) pass.
- **165-events-pipeline-cli-and-cron: VERIFIED.** `cli.ts`: MIN_NODE 22.13 (`:13`), stale lock 2 h (`:14`), max-sessions default 25 (`:16`), token required except status (`:72-75`), DB dir mode 0700 (`:200`), lock-skip output (`:212-214`); `crontab.example` has 05:30/17:30 discover and 6-hourly refresh with TZ America/Los_Angeles and `npm run events:run --`; README present.
- **166-events-docs: VERIFIED.** `docs/events.md` has sections 1-8 (Overview, Consent, Schema, Household API, Service API, Calendar linking, Preference learning, Pipeline). `CLAUDE.md` lists `household-*.ts` (`:89`), `service-token.ts` (`:91`), `events-service.ts` (`:90`), `shared/household.ts` (`:116`), `services/events-pipeline/` (`:121`), has `EVENTS_SERVICE_TOKEN_SHA256` (`:152`) and the "Events and household address" subsection (`:246-253`) with all five rules. No code changed in that PRD.

## Findings
### Critical
- none
### Important
- none
### Minor
- Worktree lacked `node_modules`, so gates only ran via a symlink to the main checkout's modules; results are equivalent but not from a fresh install.
- Combined diff is large (77 files, +11.5k lines) and spans the whole Events epic; I reviewed the pipeline package (spawn argv, prompt builders, URL guard, lock, config) by reading, plus the tests; `/code-review` and `/security-review` were not run as separate steps, this was a self-review for unsafe input handling, secrets (token read from env only, never printed in status), path traversal (DB/lock paths from env/home only) and duplicated helpers. Nothing found.
