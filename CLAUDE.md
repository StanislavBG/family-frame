<!-- md-network-map owner: Bilko last-review: 2026-11-15 -->
# Family Frame

PWA "The Window Between Homes": households share a wall-display dashboard of apps.
Apps and manifests live in `shared/apps.ts`; stack and versions in `package.json`
(React 18 + Vite + Tailwind/shadcn in `client/`, Express in `server/`, Zod schemas in `shared/`).
External services: Clerk (auth), Firebase Realtime Database, Open-Meteo (no key), Google Photos and Pixabay.
Local services (Events pipeline, mail intake) live in `services/`.

## Commands

- `npm run dev` - Express + Vite on port 5000; loads `.env` when present
- `npm run build` / `npm start` - production build and run
- `npm run check` - tsc over `client/src`, `shared`, `server`
- `npm test` - vitest + node:test for `server/*.test.ts` and `script/*.test.ts`, including the markdown drift check (`script/docs-check.test.ts`)
- `npm run docs:check` - markdown drift check
- `npm run events:test` | `events:check` | `events:run` - Node 22; outside `npm test` and `check`
- `npm run inbox:test` | `inbox:check` | `inbox:run` - mail intake; outside `npm test` and `check`
- `npm run release -- --dry-run` - see Release below

## Rules that apply everywhere

- Local dev uses the production Firebase database: local writes change real data.
- Secrets live in `.env` (git-ignored) and Replit Secrets; the GitHub repo is public.
- Identity comes only from `server/auth.ts` (verified Clerk session or `ff_pat_` token).
- Agent data (mail, datasets, media, metrics) is private per account and never
  exposed through household connections.
- The street address lives only at `householdProfiles/<uid>`; LLM prompts never
  contain addresses, names or birthdays.
- Every `claude -p` call pins `--model` (`services/events-pipeline/haiku.ts`).
- The files in `.claude/rules/` load when you touch matching files.

## Where to look

| Area | Read |
| --- | --- |
| Folder conventions | [.claude/rules/client.md](.claude/rules/client.md), [.claude/rules/server.md](.claude/rules/server.md) |
| App registry | [.claude/rules/apps.md](.claude/rules/apps.md) |
| Agent access (tokens, scopes, MCP, mail, datasets, media) | [docs/agent-access.md](docs/agent-access.md), [.claude/rules/agent-data.md](.claude/rules/agent-data.md) |
| People | [docs/person-publishing.md](docs/person-publishing.md), [.claude/rules/people.md](.claude/rules/people.md) |
| Time-series and Utilities | [docs/time-series.md](docs/time-series.md), [.claude/rules/time-series.md](.claude/rules/time-series.md) |
| Events | [docs/events.md](docs/events.md), [.claude/rules/events.md](.claude/rules/events.md) |
| Running the Events pipeline | [services/events-pipeline/README.md](services/events-pipeline/README.md) |
| Running the mail intake | [services/mail-intake/README.md](services/mail-intake/README.md) |
| Household email | [docs/household-email.md](docs/household-email.md), [.claude/rules/household-email.md](.claude/rules/household-email.md) |
| Env vars, local dev, deploy | [docs/operations.md](docs/operations.md) |
| Release procedure | [.claude/agents/builder.md](.claude/agents/builder.md) |
| Replit Agent entry (a pointer) | [replit.md](replit.md) |
| bilko.run card | [docs/bilko-run.md](docs/bilko-run.md), `bilko.listing.json` |
| Validation records (machine-written, read by `script/release.ts`) | `session-manager-operations/reviews/validation/` |

## Release

Release means GitHub `main` holds all good-to-go work. Run `npm run release` from the
main checkout (`--dry-run` first; `--include <branch>` for a non-Epic branch the human
named) when a plan's validator has VERIFIED every PRD, or when the human asks.
The "Publish to GitHub" HOT KEYS macro runs it through the `builder` agent.
Held branches (uncommitted changes, open PRDs, REFUTED validation, merge conflict)
are reported, never forced. Deploy happens when a human pulls `main` in Replit's
Git pane and clicks Publish.

## Design

Hearth & Heritage palette: `client/src/index.css`. People and Events use the Satchel
tokens in `client/src/components/person/satchel.tsx`.
