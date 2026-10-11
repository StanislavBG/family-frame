# Events pipeline

Local job that finds events for households that opted in, publishes them to Family Frame, and re-checks them. It runs on the operator's machine from cron, using the operator's Claude subscription (Haiku, read-only web tools).

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
   ```

   Point the CLI at it with `EVENTS_ENV_FILE=<path>`. The DB directory is created with mode 0700. Missing required config exits 2 with a one-line message.
4. **Dry run first**:

   ```
   EVENTS_ENV_FILE=~/.config/family-frame-events/env npm run events:run -- all --dry-run --household <id>
   npm run events:run -- status
   ```

   Dry runs search and rank but publish nothing; `refresh --dry-run` only counts due events.
5. **Install the crontab** (manual step): `mkdir -p ~/.local/state/family-frame-events`, copy `crontab.example`, set `REPO` and `EVENTS_ENV_FILE`, then `crontab -e`. Two jobs: `watch` every 5 minutes, and one daily `all` run (discover + refresh) at 05:30 Pacific.

## Commands

`npm run events:run -- <discover|refresh|all|watch|status> [--dry-run] [--household <id>] [--max-sessions <n>]`

Each run prints one JSON stats line and exits 0 (ok, or skipped because another run holds the lock) or 1 (error); exit 2 means bad usage or config. `status` prints household and upcoming-event counts (next 14 days, 15-30, 31-90, later) and the last runs, with no addresses or tokens.

## New households

`watch` runs every 5 minutes and costs one HTTPS request when nothing is pending (no Claude session, no geocoding). It starts a household-only discovery for a household that is new, just re-shared, or changed its address. Each household has a 30-minute cool-down and a tick handles at most 3 households; the rest wait for the next tick. Everything else (other discovery and re-checks) runs once a day at 05:30. `watch` takes the same lock as the other modes and defaults to 12 sessions per tick.

## Locking

An exclusive lock file `<EVENTS_DB_PATH>.lock` keeps two cron runs from overlapping; a lock older than 2 hours is treated as stale and replaced.

## Cost caps

`--max-sessions` (default 25) caps the Haiku sessions in one run, shared across discover and refresh when running `all` (`watch` defaults to 12). Every session is pinned to the Haiku model with read-only tools. Rate-limit or budget errors stop the run early.

## Revoking consent

When a household turns off sharing, it disappears from the household list (or the API answers "not sharing"). The next discover run deletes its local address, profile and recommendations, and any push to it is dropped. Shared canonical events stay, since they hold no household data.
