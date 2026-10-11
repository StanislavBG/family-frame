# Events

End-to-end guide to the Events app: household address and consent, the event schema, the household and service APIs, calendar linking, preference learning, and the local pipeline that finds events. Code: `shared/household.ts`, `shared/events.ts`, `shared/events-preferences.ts`, `server/household-*.ts`, `server/events-service*.ts`, `server/apps/events.ts`, `server/service-token.ts`, `client/src/lib/events.ts`, `client/src/components/events/`, `services/events-pipeline/`. UI design brief: `docs/events-design-brief.md`. Pipeline setup details: `services/events-pipeline/README.md`.

## 1. Overview

```
household (browser, Clerk session)
   |  address + "share with events service" toggle, responses, feedback
   v
Family Frame (Express + Firebase RTDB, on Replit)
   |  /api/service/events/*   (ff_svc_ token, consent re-checked per call)
   v
local pipeline (operator's machine, cron, Node 22)  services/events-pipeline/
   |-- claude -p --model Haiku (read-only web tools): search, extract, explain
   '-- Nominatim (OpenStreetMap): geocode the address for distances
```

- Households never talk to the pipeline. The pipeline polls Family Frame, publishes recommendations back, and keeps its own SQLite state (`EVENTS_DB_PATH`).
- Runs on the operator's Claude subscription, not on Replit.
- Data in RTDB: `householdProfiles/<uid>` (address, consent, `consentLog`), `eventRecs/<uid>`, `eventFeedback/<uid>`, `eventPrefs/<uid>`, `eventRunMeta/<uid>`.

## 2. Consent and privacy

Address (`PUT /api/household/address`, schema `householdAddressSchema`): `line1`, `city`, `country` required; `line2`, `region`, `postalCode`, `timezone` optional. Stored only at `householdProfiles/<uid>`. City and country are also copied to `settings.location` (weather and connections read that); the street address is not.

Consent (`PUT /api/household/events-sharing {enabled}`): the toggle shows `EVENTS_SHARING_CONSENT_TEXT` (version `EVENTS_SHARING_CONSENT_VERSION`). Every grant and revoke appends to `householdProfiles/<uid>/consentLog` (`at`, `action`, `consentVersion`). If the address becomes incomplete while sharing, sharing is revoked and logged.

| Shared with the service | Never leaves Family Frame |
| --- | --- |
| Street address and timezone | Names, birthdays, photos, messages, mailbox, datasets, media |
| Member ages (whole years, no names or birthdays) | Anything else in the household's data |
| Event preferences, feedback, learned weights | The service token is never sent to households |
| Own recommendations, response state, calendar busy intervals (no titles) | |

Inside the pipeline, the exact address is used only for geocoding and distances. LLM prompts get city and area only: never the street address, names or birthdays.

Revoke: the toggle off stops new recommendations immediately (the household drops out of `GET /api/service/events/households`; per-household service routes answer 404). The next discover run deletes the household's local address, profile and recommendations and drops any queued push. Shared canonical events stay (they hold no household data).

Erase: `DELETE /api/events/data` removes `eventRecs`, `eventFeedback`, `eventPrefs` and `eventRunMeta` for the household. Calendar entries already created are left alone.

## 3. Event schema

`ffEventSchema` in `shared/events.ts` (`schemaVersion: 1`, strict, max 20000 bytes of JSON). Key fields:

| Field | Notes |
| --- | --- |
| `id`, `fingerprint` | id `[A-Za-z0-9_-]{1,80}`; fingerprint is the dedupe key |
| `title`, `summary` (280), `description` (5000) | |
| `category` | one of `EVENT_CATEGORIES` (parks-outdoors, nature-animals, kids-activities, baby-toddler, sports-fitness, arts-culture, music-performance, museums-learning, festivals-fairs, faith-church, food-markets, community-volunteering, holiday-seasonal, family-entertainment, other); `tags[]` max 20 |
| `schedule` | `timezone`, `start`, `end?`, `allDay`, `recurrenceText?`, `occurrences[]` (max 50) |
| `location` | venue, address, city, country (required), `lat`/`lon`, `setting` (indoor/outdoor/mixed/unknown), `online`, accessibility and parking notes |
| `cost` | `isFree`, currency, min/max price, `priceText`, `ticketRequired`, `registrationRequired`, https URLs |
| `audience` | `ageBands[]` (baby ... senior, all-ages), `ageMin/Max`, `familyFriendly`, `strollerFriendly`, `languages` |
| `organizer`, `media` | optional |
| `sources[]` | 1-10 https sources with `kind` (official, listing, social, news, other) and `retrievedAt` |
| `status`, `statusNote` | `scheduled`, `tentative`, `postponed`, `rescheduled`, `cancelled`, `sold-out`, `moved-online`, `ended` |
| `updates[]` | append-only change history (max 50): `at`, `kind`, `summary`, optional `field`, `before`, `after`, `sourceUrl`. The UI shows it as a timeline |
| `verification` | `lastCheckedAt`, `lastChangedAt?`, `checkCount`, `confidence` 0-1 |
| `firstSeenAt` | |

`updates[].kind`: `cancelled`, `postponed`, `rescheduled`, `time-changed`, `venue-changed`, `price-changed`, `sold-out`, `announcement`, `details-changed`, `reinstated`.

Per-household wrapper (`recommendationInputSchema`): `event`, `whyForHousehold`, `whyForChildren?`, `highlights[]`, `tips[]`, `matchScore` 0-1, `matchReasons[]`, `distanceKm?`, `travelMinutes?`. Batches of up to 50 per PUT. Household response states: `new`, `interested`, `going`, `maybe`, `not-interested`, `dismissed`. `SAMPLE_EVENT` in `shared/events.ts` is a full example. Unchanged re-publishes are no-ops; `new` and `dismissed` recommendations are pruned 30 days after the event ended.

## 4. Household API (`/api/events/*`)

Signed-in session (Clerk headers), implemented in `server/apps/events.ts` over `server/events-service.ts`. Address and consent routes live in `server/household-routes.ts` and are session-only (403 for PATs and the service token): `GET /api/household/profile`, `PUT /api/household/address`, `PUT /api/household/events-sharing`.

| Route | Purpose |
| --- | --- |
| `GET /api/events/status` | `sharingEnabled`, `addressComplete`, `lastPublishedAt`, counts (new, going, interested, changed) |
| `GET` / `PUT /api/events/preferences` | stated preferences (liked/avoided categories, `maxDistanceKm` default 30, budget, days, times, languages, notes) |
| `GET /api/events/feedback?since&limit` | the append-only preference audit log |
| `DELETE /api/events/data` | erase all events data (204) |
| `GET /api/events/items?from&to&include=all` | recommendations; hidden (not-interested, dismissed, withdrawn) only with `include=all` |
| `GET /api/events/items/:eventId` | one recommendation |
| `POST .../response` | `response`, optional `addToCalendar`, `visibility`, `people`, `reason` |
| `POST .../feedback` | `signal`, optional `reason` (max 280) |
| `PATCH .../plan` | `occurrenceStart`, `notes`, `people`, `visibility` (at least one) |
| `POST .../seen` | clears the unseen-change flag (204) |

## 5. Service API (`/api/service/events/*`)

Only for the pipeline. Auth: `Authorization: Bearer ff_svc_...`. The server compares the token's SHA-256 against `EVENTS_SERVICE_TOKEN_SHA256` (Replit Secret, timing-safe, see `server/service-token.ts`). Unset or malformed hash rejects every token, which disables the service API. A service token is confined to `/api/service/events/`; every other `/api/service` request gets 403. Mint a token and its hash with the one-liner in `services/events-pipeline/README.md`; rotate by minting a new pair and updating both sides.

Consent is checked on every per-household route: a household that is not currently sharing is a plain 404.

| Route | Purpose |
| --- | --- |
| `GET /api/service/events/households` | sharing households: `householdId`, `homeName?`, `address`, `timezone?`, `memberAges`, `preferences`, `learned`, `lastPublishedAt`, `consentVersion` |
| `GET .../households/:id/state?feedbackSince=` | existing recommendations (id, fingerprint, title, start/end, category, status, response, feedback, `calendarLinked`, `withdrawn`), calendar `busy` intervals for the next 90 days, feedback, preferences, `learned` |
| `PUT .../households/:id/recommendations` | upsert a batch (`runId`, `recommendations[]`); the household cap is 400 active |
| `DELETE .../households/:id/recommendations/:eventId` | withdraw (hide) a recommendation |
| `POST .../households/:id/runs` | record a run (`runId`, `kind` discover/refresh, `startedAt`, `finishedAt`, `stats`) |

## 6. Calendar linking rules

Implemented in `server/events-service.ts` using `calendar-service.ts`.

- `going` creates a calendar entry by default; `interested` and `maybe` only when `addToCalendar: true`. Source is `{app: "events", refId: eventId}`.
- Visibility is `Private` unless the household picks `Shared`; changing it later (response or plan) updates the entry's `type`.
- `not-interested` and `dismissed` delete the linked entry.
- `plan.occurrenceStart` picks which occurrence of a recurring event the entry uses; `plan.notes` and `people` flow into the entry.
- Pipeline changes sync to the entry: cancelled sets it cancelled (reinstated clears it); a schedule change moves the dates unless the household chose a specific occurrence.
- If the household deletes the entry, the link is dropped and never silently recreated; only an explicit `addToCalendar: true` recreates it.
- Erasing events data and revoking consent leave calendar entries alone.

## 7. Preference learning

Every response and feedback appends to `eventFeedback/<uid>` (id, `at`, `eventId`, `signal`, optional reason, and a `snapshot` of title, category, tags, `isFree`, distance, weekday, age bands). The log is the audit trail; weights are recomputed from it by `aggregatePreferences` in `shared/events-preferences.ts`.

| Signal | Weight |
| --- | --- |
| `more-like-this` | +1.5 |
| `liked`, `response:going` | +1 |
| `relevant`, `response:interested` | +0.5 |
| `response:dismissed` | -0.25 |
| `not-relevant`, `response:not-interested` | -0.75 |
| `disliked` | -1 |
| `less-like-this` | -1.5 |

Weights decay with a 120-day half-life. Category sums are normalised with `tanh(sum / 3)` to -1..1; stated liked categories add +0.6, stated avoided categories force -1. Tags get half weight (top 30 kept). Output also has `freePreference`, `preferredWeekdays`, `maxDistanceKm` and up to 6 human lines ("Likes: ...") shown in the app as what has been learned. The service API returns this as `learned`.

## 8. Pipeline

`services/events-pipeline/` is a separate Node 22.13+ package (`node:sqlite`), run with `npm run events:run -- <discover|refresh|all|watch|status> [--dry-run] [--household <id>] [--max-sessions <n>]`. It is excluded from the root `npm test` and `npm run check`; use `npm run events:test` and `npm run events:check`.

Modules: `cli.ts` (entry, lock, stats line), `ff-client.ts` (service API client), `db.ts` (SQLite state), `geo.ts` (Nominatim, cached, one request at a time), `search.ts` (query planning per window), `haiku.ts` (`claude -p` runner), `normalize.ts` (raw result to `ffEventSchema`), `rank.ts` (scoring with learned weights, distance, busy overlap, dedupe), `explain.ts` (why-for-household/children text, template fallback), `discover.ts` (purge revoked, search, dedupe, rank, explain, publish), `dispatch.ts` (re-check due events, push changes).

Search windows (`SEARCH_WINDOWS`), each searched again when due:

| Window | Days ahead | Re-search every |
| --- | --- | --- |
| focus | 0-14 | 20 hours |
| near | 15-45 | 3 days |
| far | 46-90 | 7 days |

Known events and the household's busy intervals are passed in so searches avoid duplicates and clashes. Re-check cadence per event (`nextCheckAt`): daily within 3 days of the start (and while running), every 2 days within 14 days, weekly beyond; none once ended. Changes are appended to `updates[]` and pushed.

Cost caps: `--max-sessions` (default 25) caps Haiku sessions per run, shared across discover and refresh in `all`. Every `claude -p` call pins `--model claude-haiku-4-5-20251001` with read-only web tools; rate-limit or budget errors stop the run. A lock file `<EVENTS_DB_PATH>.lock` prevents overlap (stale after 2 hours).

Config (env file, mode 0600, via `EVENTS_ENV_FILE`): `FF_BASE_URL`, `FF_SERVICE_TOKEN`, optional `EVENTS_DB_PATH`, `CLAUDE_BIN`, `NOMINATIM_USER_AGENT`. Missing config exits 2.

Cron: `services/events-pipeline/crontab.example` installs two jobs by hand (`crontab -e`):

- Watch, every 5 minutes (`events:run -- watch`): one HTTPS request lists the households; a household-only discovery starts for each one that is new (no local row), re-shared, changed its address, or was never discovered. A household is skipped for 30 minutes after it was last triggered, and at most 3 households run per tick (the rest wait for a later tick). An idle tick makes no Claude session. Watch caps Haiku sessions at 12 per household run by default.
- Daily at 05:30 America/Los_Angeles (`events:run -- all`): discover plus re-check of known events for every household.

Dry run: add `--dry-run` to search and rank without publishing (`refresh --dry-run` only counts due events). `status` prints household and upcoming-event counts and recent runs, with no addresses or tokens. Always dry-run one household before enabling cron.
