# Validation: bilko-listing-passion-project

Base: b16ad8b. Commit in range: c9d30d8 (touches only `bilko.listing.json`).

## bilko-listing-passion-project — VERIFIED

- Content matches the PRD JSON: read `bilko.listing.json` against the PRD notes, all fields identical (2-space indent; short arrays on one line).
- `icon` / `shareImage` unchanged: `git diff b16ad8b..HEAD -- bilko.listing.json` shows lines 12-13 as context only.
- Limits (measured): tagline 117/160; detail 310/400; metric 8/24; metricLabel 20/24; audience 136/200; callToAction 55/120; tags 3 (15/3/6 chars); talkingPoints 5 (max 129); avoidClaims 5 (max 131). offering `showcase`, pricing `free`.
- "15+ apps": `shared/apps.ts:4-24` lists 19 ids; minus `home` and `settings` = **17**. True.
- `docs/bilko-run.md`: no offering/CTA text (grep found only the card-copy pointer and limits at lines 9, 39); untouched is correct.
- Gate: re-ran the node limit check, exit 0.
- Talking points vs app: connected-household weather is real (`server/routes.ts:614` `/api/connections/weather`); clock, weather, photos, calendar, events, messages, chores, recipes, shopping, radio, tv, baby-songs, stocks, utilities are all in `APP_IDS`; grandma-friendly is the CLAUDE.md design philosophy. "Local events" = Events app. "Early testers welcome" / "almost ready" are owner positioning, not product claims.

## Findings

- Critical: none.
- Important: none.
- Minor: `detail` says "household bills" and tagline "household bills"; the Utilities app displays agent-published bills, it does not fetch them itself. Acceptable shorthand; no change needed.
- Minor: code-review / security-review: the diff is one JSON copy file, no code, secrets or input handling. Self-reviewed, nothing found.
