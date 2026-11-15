# Events pipeline

Local job that finds events for households that opted in, publishes them to Family Frame, and re-checks them. It runs on the operator's machine from systemd user timers or cron, using the operator's Claude subscription (Haiku, read-only web tools). This file owns how to set up and run it; the pipeline's design (phases, source rule, ranking, trips) is in [docs/events.md section 8](../../docs/events.md#8-pipeline).

## Contents

- [Setup](#setup)
- [Commands](#commands)
- [Development](#development)
- [Launcher](#launcher)
- [Scheduling](#scheduling)
- [Watch (first discovery)](#watch-first-discovery)
- [Locking](#locking)
- [Cost caps](#cost-caps)
- [Run stats](#run-stats)
- [Profiling a run](#profiling-a-run)
- [Notifications](#notifications)
- [Revoking consent](#revoking-consent)

## Setup

1. **Node 22.13 or newer** (`node:sqlite`). The CLI refuses to start on older versions.
2. **Mint a service token** and its hash:

   ```
   node -e "const c=require('crypto');const t='ff_svc_'+c.randomBytes(32).toString('base64url');console.log(t);console.log(c.createHash('sha256').update(t).digest('hex'))"
   ```

   Line 1 is the token (keep it secret, it goes only in the env file). Line 2 is its SHA-256: set it as `EVENTS_SERVICE_TOKEN_SHA256` in Replit Secrets and redeploy.
3. **Env file**, outside the repo or git-excluded, mode 0600, for example `~/.config/family-frame-events/env`:

   ```
   FF_BASE_URL=https://your-family-frame-host
   FF_SERVICE_TOKEN=ff_svc_...
   # optional
   EVENTS_DB_PATH=/home/you/.local/share/family-frame-events/events.db
   CLAUDE_BIN=/usr/local/bin/claude
   NOMINATIM_USER_AGENT=FamilyFrameEvents/1.0 (you@example.com)
   EVENTS_NOTIFY=off
   ```

   Point the CLI at it with `EVENTS_ENV_FILE=<path>`. The DB directory is created with mode 0700. Missing required config exits 2 with a one-line message.
4. **Dry run one household first**, before enabling a timer or cron:

   ```
   EVENTS_ENV_FILE=~/.config/family-frame-events/env npm run events:run -- all --dry-run --household <id>
   npm run events:run -- status
   ```

   Dry runs search and rank but publish nothing; `refresh --dry-run` only counts due events.
5. **Schedule it** with systemd user timers or cron (see [Scheduling](#scheduling)).

## Commands

`npm run events:run -- <discover|refresh|all|watch|status|report|purge-signups> [--dry-run] [--household <id>] [--max-sessions <n>]`

`report` also takes `--runs <n>`.

- `discover`: search, rank, explain and publish for every sharing household (or the one given).
- `refresh`: re-check due known events and push changes.
- `all`: discover, then refresh, then trip ideas, then local retention pruning. This is the daily run.
- `watch`: start a first discovery for households that need one (see [Watch](#watch-first-discovery)).
- `status`: household and upcoming-event counts (next 14 days, 15-30, 31-90, later) and the last runs, with no addresses or tokens.
- `report`: Markdown profile of recent runs (see [Profiling a run](#profiling-a-run)).
- `purge-signups`: cleanup for the original-source gate (below).

Each run prints one JSON stats line. Exit codes: 0 ok (also a `watch` tick that found the lock held: `{"skipped":"locked"}`), 1 error (also any other locking mode that gave up waiting for the lock), 2 bad usage or config.

`purge-signups [--dry-run] [--household <id>]`: for each sharing household it withdraws (and deletes locally) every sign-up recommendation whose response is still `new` and that is not linked to the calendar, and drops local rows already withdrawn; answered or linked ones are kept. It then deletes local events that no household holds and that are sign-up activities or lack an official source, and marks held events without an official source as due so the next re-check finds the organizer's page or withdraws them. `--dry-run` only counts and changes nothing; `--household` limits the households. It takes the same lock (and lock wait) as the other modes and prints one JSON line (`households` with `withdrawn`, `kept`, `titles`; `deletedEvents`; `markedDue`).

## Development

The package is excluded from the root `npm test` and `npm run check`. Use:

```
npm run events:test
npm run events:check
```

## Launcher

`npm run events:run` and the systemd units start `node services/events-pipeline/launch.mjs <mode>` (no sh or tsx), so each watch tick is one process. `launch.mjs` bundles `cli.ts` with esbuild into `.cache/events-pipeline/` (git-ignored) on first run and reuses it; it rebuilds itself when any bundled source file or the launcher changes, so there is nothing to clear by hand.

## Scheduling

Two jobs: `watch` every 5 minutes and one daily `all` run. Use systemd user timers or cron, not both.

### systemd user timers (laptops)

Cron skips jobs while a laptop is asleep or off; systemd user timers can catch up. Templates are in `systemd/`; they assume the repo is at `~/Projects/family-frame` (edit `WorkingDirectory` if not) and the env file at `~/.config/family-frame-events/env`.

```
mkdir -p ~/.config/systemd/user ~/.local/state/family-frame-events
cp systemd/family-frame-events-* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now family-frame-events-watch.timer family-frame-events-daily.timer
```

Check:

```
systemctl --user list-timers
tail ~/.local/state/family-frame-events/watch.log
```

- `family-frame-events-watch.timer` runs every 5 minutes and does not catch up.
- `family-frame-events-daily.timer` runs daily at 05:32 (local time, up to 60 s random delay) with `Persistent=true`, so a missed run starts after the laptop wakes or boots. The daily service has a 240-minute start timeout.
- Logs append to `~/.local/state/family-frame-events/watch.log` and `daily.log`.

After pulling a change to the unit files, re-copy them and reload:

```
cp systemd/family-frame-events-* ~/.config/systemd/user/
systemctl --user daemon-reload
```

### cron (always-on machines)

`mkdir -p ~/.local/state/family-frame-events`, copy `crontab.example`, set `REPO` and `EVENTS_ENV_FILE`, then `crontab -e`. It runs `watch` every 5 minutes and `all` daily at 05:30 America/Los_Angeles.

## Watch (first discovery)

`watch` costs one HTTPS request when nothing is pending (no Claude session, no geocoding). It starts a household-only discovery for a household that has no local row yet, was re-shared, changed its address, or was never discovered. Each household has a 30-minute cool-down after it was last triggered and a tick handles at most 3 households; the rest wait for a later tick. Everything else (other discovery and re-checks) runs in the daily run.

## Locking

An exclusive lock file `<EVENTS_DB_PATH>.lock` keeps two runs from overlapping; a lock older than 4.5 hours is treated as stale and replaced (the daily run is limited to 4 hours). `discover`, `refresh`, `all` and `purge-signups` wait for the lock up to 20 minutes (40 tries, 30 seconds apart) so the daily run does not lose to a long watch run; if another run held it the whole time, the run prints `{"skipped":"locked","waitedMs":...}`, sends a critical notice and exits 1. `watch` does not wait. `report` and `status` take no lock.

To end inside the 4-hour limit, `all` stops starting re-checks 195 minutes after it starts (a check already running finishes); the remaining due events roll over to the next run.

## Cost caps

`--max-sessions` caps Haiku sessions per phase, not per run: in `all`, discover, refresh and trips each get their own runner and their own budget of that size, so a long discover cannot starve the trips. Default 45 for `discover`, `refresh` and `all`; 20 per household run for `watch`. Every `claude -p` call pins `--model claude-haiku-4-5-20251001` (`haiku.ts`) with read-only web tools. Rate-limit or budget errors stop the run early. Trip ideas run only in a non-dry `all` run, at most one Haiku session per household.

## Run stats

The printed JSON line carries `mode`, `dryRun`, `discover`, `refresh`, `trips`, `haiku` (sessions and cost summed over the phases), `ms` and, for a non-dry `all` run, `pruned`. Each phase's stats are also stored in the local DB (`runs.stats_json`), which `report` reads. Fields:

- `haiku`: `sessions`, `costUsd`.
- `discover`: `households`, `purged`, `searches`, `candidates`, `invalidCandidates`, `newEvents`, `merged`, `published`, `skipped`, `errors`, `ranked`, `closeToHome` (ranked picks that are close to home), `classes`, `geocodeHits` / `geocodeMisses`.
- `normalizeRejected` and `normalizeRejectReasons`; `searchFailures` and `skippedByReason` (counts by reason).
- `linkCheck`: `ok`, `dead`, `moved`, `blocked`, `refused`, `error`.
- `officialCheck`: `confirmed`, `rejected`, `unavailable`.
- `phaseMs`: `prepare`, `search`, `rank`, `explain`, `publish` (milliseconds).
- `refresh`: `checked`, `changed`, `cancelled`, `pushed`, `failed`, `linksRemoved`, `withdrawn`, `stoppedAtDeadline` (with `--dry-run`, only `due`).
- `trips`: `households`, `active`, `refreshed`, `created`, `retired`, `failed`. A trip failure never changes the exit code; it only sets `trips.failed`.
- `pruned`: local rows removed by `pruneLocalState` (`events`, `recommendations`, `searchLog`, `runs`).

## Profiling a run

`npm run events:run -- report [--household <id>] [--runs <n>]` prints a Markdown profile of the last `n` runs (default 10) from the local DB to stdout. It needs no `FF_*` config, takes no lock, makes no network calls and shows no address, coordinates, profile or tokens. Sections:

- **Runs**: one row per recent run (kind, start, duration, ok/error/running, Haiku sessions, cost USD, searches, candidates, normalize rejected, ranked, published). Watch rows sum their per-household discover stats; cells without data show `-`.
- **Where candidates were lost**: for the latest run with discover stats, the top normalize reject reasons, search failures, skipped-by-reason counts, phase timings, a `link check` line (ok/dead/moved/blocked/refused/error) and an `official page check` line (confirmed/rejected/unavailable).
- **Recommendations**: per household (or the one given), last discovered/triggered and up to 30 published recommendations (title, start, category, match, distance, status, response), then cost per published recommendation.

## Notifications

`watch`, `discover`, `refresh` and `all` send desktop notices through `notify-send` (rules in `notify.ts`):

- Per household: a normal notice with published of candidates (and cost) after a successful run, a critical one when that household's run failed.
- Per job: a critical `failed` notice on the first failure or when the error text changes; the same unchanged failure repeats as `still failing` at most once per 24 hours; the first success after failures sends `recovered`. Failure state is kept per job in the local DB (`notify_state`).
- `all` also sends a low-urgency daily summary (published, candidates, errors, cost), and a normal-urgency "Events trip ideas failed" notice with the failed count, active and created trips when trip research fails.
- A lock wait that gives up sends a critical "run skipped" notice.

Notices carry only ids, counts, costs and clipped error text. Set `EVENTS_NOTIFY=off` in the env file to silence them. A missing `notify-send` or desktop session is ignored and never fails a run.

## Revoking consent

When a household turns off sharing, it disappears from the household list (or the API answers "not sharing"). The next discover run deletes its local address, profile and recommendations, and any push to it is dropped. Shared canonical events stay, since they hold no household data.
