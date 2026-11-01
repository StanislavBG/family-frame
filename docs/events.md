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
| `cost` | `isFree`, `admission` (optional: `free`, `donation`, `paid-entry`, `ticketed`), currency, min/max price, `priceText`, `ticketRequired`, `registrationRequired`, https URLs. When `admission` is absent the pipeline derives it: `ticketed` if `ticketRequired`, else `free` if `isFree`, else `paid-entry` |
| `audience` | `ageBands[]` (baby ... senior, all-ages), `ageMin/Max`, `familyFriendly`, `strollerFriendly`, `languages` |
| `organizer`, `media` | optional |
| `sources[]` | 1-10 https sources with `kind` (official, listing, social, news, other) and `retrievedAt` |
| `status`, `statusNote` | `scheduled`, `tentative`, `postponed`, `rescheduled`, `cancelled`, `sold-out`, `moved-online`, `ended` |
| `updates[]` | append-only change history (max 50): `at`, `kind`, `summary`, optional `field`, `before`, `after`, `sourceUrl`. The UI shows it as a timeline |
| `verification` | `lastCheckedAt`, `lastChangedAt?`, `checkCount`, `confidence` 0-1 |
| `firstSeenAt` | |

`updates[].kind`: `cancelled`, `postponed`, `rescheduled`, `time-changed`, `venue-changed`, `price-changed`, `sold-out`, `announcement`, `details-changed`, `reinstated`.

Per-household wrapper (`recommendationInputSchema`): `event`, `whyForHousehold`, `whyForChildren?`, `highlights[]`, `tips[]`, `matchScore` 0-1, `matchReasons[]`, `distanceKm?`, `travelMinutes?`, `tripType?`, `driveMinutes?`, `trip?`. Batches of up to 50 per PUT. Household response states: `new`, `interested`, `going`, `maybe`, `not-interested`, `dismissed`. `SAMPLE_EVENT` in `shared/events.ts` is a full example. Unchanged re-publishes are no-ops; `new` and `dismissed` recommendations are pruned 30 days after the event ended.

Close to home (`closeToHome`, boolean on household items): true when the event is not online, not a trip idea, and either within 5 miles (8.05 km, `CLOSE_TO_HOME_MILES` / `CLOSE_TO_HOME_KM`) of home or in the household's own city. The rule lives in `shared/events-proximity.ts` (`isCloseToHome`; city names are compared canonically, ignoring case, accents and a trailing region). It is derived at read time by `GET /api/events/items` and `GET /api/events/items/:eventId` from the household's city and country, so it is never stored and the street address is not involved. The app shows a "Close to home" chip and filter.

Trip fields (`shared/events.ts`): `tripType` is `local`, `day-trip` or `weekend`; `driveMinutes` (0-600) is the estimated drive from the household. `trip` (`tripSchema`) is present only on trip ideas and must match `tripType`: `type` (`day-trip` or `weekend`), `driveMinutes`, `nights` (weekend 1-2, day trip 0), `itinerary[]` (1-3 days, each a `label` and 1-10 timed `items` of kind drive, activity, meal, rest, lodging or other), `lodging[]` (weekend 1-3 options with name, area, `priceText` and https `url`; day trips have none) and optional `bestFor`. Trips are research only: the pipeline never books anything, it links to pages the household can open.

Planned visit (`plan.visit`, `visitPlanSchema`): `{start, end}` as local wall-clock times without an offset (`YYYY-MM-DDTHH:MM:SS`), on the same date, end after start, at most 12 hours. It is the part of the day the household intends to go. The server also rejects a visit on a day the event does not run or outside that day's known opening hours (400).

Visit preferences (in `eventPrefs`, `PUT /api/events/preferences`): `visitBlockMinutes` (60-240, default 150), `visitEarliest` (`HH:MM`, default `10:00`) and `visitLatestEnd` (`HH:MM`, default `18:00`). They shape the suggested block (section 6).

Ticket and trip preferences (also in `eventPrefs`): `maxTicketPrice` (0-5000, default 500) is the highest cheapest-ticket price accepted for ticketed shows, and `tripsEnabled` (default true) turns trip ideas on or off for the household.

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
| `POST .../response` | `response`, optional `addToCalendar`, `visibility`, `people`, `reason`, `visit` (`{start, end}`, see `plan.visit` in section 3) |
| `POST .../feedback` | `signal`, optional `reason` (max 280) |
| `PATCH .../plan` | `occurrenceStart`, `notes`, `people`, `visibility`, `visit` (at least one) |
| `POST .../seen` | clears the unseen-change flag (204) |

## 5. Service API (`/api/service/events/*`)

Only for the pipeline. Auth: `Authorization: Bearer ff_svc_...`. The server compares the token's SHA-256 against `EVENTS_SERVICE_TOKEN_SHA256` (Replit Secret, timing-safe, see `server/service-token.ts`). Unset or malformed hash rejects every token, which disables the service API. A service token is confined to `/api/service/events/`; every other `/api/service` request gets 403. Mint a token and its hash with the one-liner in `services/events-pipeline/README.md`; rotate by minting a new pair and updating both sides.

Two failures look alike but mean different things:

| Status | Body | Meaning | Operator action |
| --- | --- | --- | --- |
| 503 | `Service API not configured` | `EVENTS_SERVICE_TOKEN_SHA256` is unset or malformed on the server | set the Replit secret to the 64-hex SHA-256 and republish |
| 401 | `Invalid service token` | the server has a hash, but the token's SHA-256 does not match it | re-mint the pair, update both the Replit secret (then republish) and `FF_SERVICE_TOKEN` in the env file |

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
- The entry uses `plan.visit` (its date, start and end time) when set; otherwise the chosen occurrence, otherwise the event's main schedule. Setting `visit` through the response or plan route updates a linked entry. Choosing another occurrence through `PATCH .../plan` drops a visit planned for a different day.
- When a response creates an entry and no visit was sent, the server suggests one for long day windows (`dayWindows` and `suggestVisit` in `shared/events-visit.ts`, shared with the client):
  - The window is the chosen occurrence's day, else the next upcoming day, else the first. Days with no known hours count as 09:00-17:00.
  - If the window is no longer than `visitBlockMinutes` + 30 minutes, no visit is set and the whole window is used.
  - Otherwise the block is `visitBlockMinutes` long, kept between `visitEarliest` and `visitLatestEnd` (if that range is under 60 minutes, the window's own hours are used).
  - It starts at `visitEarliest` (rounded up to 30 minutes); only afternoon as a preferred time starts at 14:00, only evening ends at the latest end.
  - The block is moved back so it ends inside the range.
- Pipeline changes sync to the entry: cancelled sets it cancelled (reinstated clears it); a schedule change moves the dates unless the household chose a specific occurrence or a visit. A schedule change never moves a visit.
- If the household deletes the entry, the link is dropped and never silently recreated; only an explicit `addToCalendar: true` recreates it.
- Erasing events data and revoking consent leave calendar entries alone.

## 7. Preference learning

Every response and feedback appends to `eventFeedback/<uid>` (id, `at`, `eventId`, `signal`, optional reason, and a `snapshot` of title, category, tags, `isFree`, distance, weekday, age bands). Entries are stored as RTDB objects, and RTDB drops empty arrays (an empty `tags` or `ageBands` comes back missing). So `listFeedback` in `server/events-service.ts` reads every entry through `feedbackEntrySchema` (which defaults the arrays) and skips, with a warning, any entry that still fails. Never read the raw RTDB value as a `FeedbackEntry`; the 2026-10-16 outage came from doing that. The log is the audit trail; weights are recomputed from it by `aggregatePreferences` in `shared/events-preferences.ts`.

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

Household profile (`shared/events-profile.ts`, `householdProfile(memberAges)`): life stages (`baby`, `toddler`, `preschool`, `school-age`, `teen`, `adults-only`, `multi-generational`) and up to 3 plain lines such as "Household: 2 adults and a toddler (1-2)." They come from the member ages the service API already shares, so there is no new personal data and no consent change. The lines go into the explain and trip prompts together with `PROFILE_GUIDANCE`: the profile and preferences are hints, not filters, and the model should still include some ideas outside them.

## Browse model (filters and day view)

Client-only; no API change. Logic is pure and unit-tested in `client/src/lib/events-filters.ts` (groups, defaults, `parseBrowse`, `matchesFilters`, `kindCounts`, `dayAllowed`); the bar is `components/events/events-filter-bar.tsx`, rendered by `pages/events.tsx`.

Filter groups. Each group answers one question and the groups combine (all must match):

| Group | Meaning | Choices |
| --- | --- | --- |
| Show | The household's response | All open (default, hides not-interested and dismissed), New, Interested, Going, Not for us |
| When | Days only | Any day, This weekend, Sat & Sun |
| What | Kind of thing only | Everything, Classes & sign-ups, Day trips, Weekend getaways (with counts that honour the other groups) |
| How far | Distance only | Any distance, Close to home (5 miles or same city), Nearby (under 45 minutes' drive) |
| Cost | Price | Any price, Free, Paid / Ticketed |
| Topic | `category` | All topics, then one per category in use |
| Who | Household members | Everyone, or picked people (multi-select; shown only with 2 or more people); filters by the age fit of `audience` |

Rule: When means days, What means kind and How far means distance. Keep them apart: "Sat & Sun" is things that happen on those days (When), "Weekend getaways" is the trip idea (What), and "Close to home" is never a When or What choice. Trip ideas have no dates, so When does not filter them. A new filter must fit one of these meanings or become its own group.

Browse state (view, filters, selected day, month, last open day) is one object kept per browser session under `ff.events.browse.v1` with `useSessionState` and rebuilt through `parseBrowse` (unknown values fall back field by field). Choosing a When option moves the selected day to the first matching day.

Day view. Route `/day/YYYY-MM-DD` inside the Events app (bad dates are rejected by `parseDayParam` and fall back to the overview). It is the full-page version of the month view day panel and lists that day's existing events grouped by Morning, Afternoon, Evening, Classes you can sign up for, and Open all day (`dayViewSections` in `client/src/lib/events-day.ts`), with a 7-day strip to jump across days (`dayStrip`). Component: `events-day-view.tsx`. Entry points:

- the "Day" view chip next to Agenda and Month (opens the selected day);
- the day heading in the month view day panel (`events-day-panel.tsx`);
- each day heading in the agenda;
- a bare `/day/YYYY-MM-DD` link.

Back from an event page returns to the day it came from (`lastDay` in the browse state).

Classes. Helpers live in `shared/events-activity.ts` (`isClassOrLesson`, `needsSignUp`, `isSignUpActivity`, `isOngoingClass`, `signUpUrl`, `audienceGroup`, `suitsPeople`). A class with no dated session (`isOngoingClass`) is not an event on a specific date, so it stays off calendar days: the agenda, month cells and day strip counts leave it out. It appears in the "Classes you can sign up for" section of the day view and day panel, and in the classes shelf (`events-classes-shelf.tsx`, grouped For the kids / For grown-ups / For all of us, with the sign-up link). `splitClasses` in `pages/events.tsx` splits the visible items into calendar items and shelf items. Classes with dated sessions are ordinary events on those days. Choosing What = Classes & sign-ups shows every class or sign-up activity.

## 8. Pipeline

`services/events-pipeline/` is a separate Node 22.13+ package (`node:sqlite`), run with `npm run events:run -- <discover|refresh|all|watch|status|report> [--dry-run] [--household <id>] [--max-sessions <n>]` (`report` also takes `--runs <n>`). It is excluded from the root `npm test` and `npm run check`; use `npm run events:test` and `npm run events:check`.

Modules (trip modules are described below): `cli.ts` (entry, lock, stats line), `ff-client.ts` (service API client), `db.ts` (SQLite state), `geo.ts` (Nominatim, cached, one request at a time), `search.ts` (query planning per window), `haiku.ts` (`claude -p` runner), `normalize.ts` (raw result to `ffEventSchema`), `rank.ts` (scoring with learned weights, distance, busy overlap, dedupe), `explain.ts` (why-for-household/children text, template fallback), `discover.ts` (purge revoked, search, dedupe, rank, explain, publish), `dispatch.ts` (re-check due events, push changes), `trips.ts` (research one trip idea), `trips-run.ts` (trip pool per household).

Search windows (`SEARCH_WINDOWS`), each searched again when due:

| Window | Days ahead | Re-search every |
| --- | --- | --- |
| focus | 0-14 | 20 hours |
| near | 15-45 | 3 days |
| far | 46-90 | 7 days |

Sign-up links: a candidate may carry `registrationUrl` (https only), stored as `cost.registrationUrl`; `registrationRequired` defaults to true when it is present. The daily re-check (`dispatch.ts`) asks for the official sign-up page only for events that need sign-up (`needsSignUp`) and have none stored, and accepts only a valid https URL of at most 2000 characters. This backfill is silent: when nothing else changed it stores the link without an `updates[]` entry or a `lastChangedAt` change, and the event is pushed so the household sees the link.

Known events and the household's busy intervals are passed in so searches avoid duplicates and clashes. Re-check cadence per event (`nextCheckAt`): daily within 3 days of the start (and while running), every 2 days within 14 days, weekly beyond; none once ended. Changes are appended to `updates[]` and pushed.

Search and ranking:

- Search plans up to 15 tasks per area (`planSearchTasks`, `maxTasks`), each asking for up to 25 candidates, capped by `--max-sessions`.
- Classes-lessons search (`CLASSES_CATEGORY_KEY` = `classes-lessons` in `search.ts`): one task in the `focus` window and one in the `near` window, over the same categories as close-to-home. The prompt asks for real, upcoming classes, lessons, courses, workshops and camps people can sign up for near home, including parent-and-child classes and classes for each child's age band. Each needs session dates (`occurrences`, or the first session in `start` plus the pattern in `recurrenceText`), price, `registrationUrl` and ages.
- Shared output rule (`isClass`): every search prompt asks for `isClass: true` on anything you sign up to attend (classes, lessons, courses, workshops, camps, clinics, leagues), and for a class `start` must be the real first session or term start from the official page, never the first day of the search range. A sign-up page goes in `registrationUrl` and a ticket-buying page in `ticketUrl`, never one in the other.
- Close-to-home search (`CLOSE_CATEGORY_KEY` = `close-to-home` in `search.ts`): one task in the `focus` window and one in the `near` window, covering every category the households do not all avoid. The prompt asks for family-friendly things to do in the household's city or within about 5 miles (8 km) of it: events, plus what local businesses and attractions offer in the date range (classes and courses with session dates or a `recurrenceText` pattern, price and registration link; farms, nature centres, museums, pools and play spaces). A place that is simply open is one candidate covering the date range, with opening hours in `recurrenceText`. The business or venue is the organizer, and anything over about 5 miles outside the city is skipped.
- Ongoing candidates (`normalize.ts`): a candidate whose start is in the past is kept when it has an upcoming occurrence (the start moves to it) or when its `end` is still in the future (an ongoing window keeps its original start and end). Otherwise it is rejected as `start date is in the past`. `recurrenceText` is clipped to 200 characters at a word boundary, ending in an ellipsis.
- Ranking allowance (`rank.ts`): close-to-home candidates (`isCloseToHome`, with the geocoded distance) get extra slots on top of the normal 3 per day: +2 per day in the focus window and +1 per day later (`closeExtraPerDay`, `laterCloseExtraPerDay`). They also have their own caps, 28 in the focus window and 15 later (`maxCloseFocus`, `maxCloseLater`), counted apart from the normal 42 and later cap, and their own per-category counter. Their match reasons start with "Close to home".
- Class tag (`shared/events-activity.ts`, `CLASS_TAG` = `class`): `normalize.ts` turns `isClass: true` into the reserved tag `class`, placed first so the 20-tag limit cannot cut it. Classes use a tag, not a new schema field, because `ffEventSchema` is strict and the pipeline runs before a Replit Publish: a new field would be rejected by the still-old server and break publishing. Tags pass through unchanged. The browse side also treats a class title (class, lesson, course, workshop, camp, clinic) as a class.
- Class identity (`normalize.ts`): the fingerprint of a class-tagged event leaves out the start date, so the same class found on another day is the same event. Near-duplicate matching for two class events needs the same city and a title similarity of at least 0.8, with no date check. When a duplicate is merged, the later window end wins, and `discover.ts` pushes the merged event to the household (unless `--dry-run`) when its schedule grew, so the household's copy does not expire.
- Class ranking (`rank.ts`): classes skip the per-day caps and have their own: 8 in the focus window and 4 later (`maxClassFocus`, `maxClassLater`), counted apart from the normal picks, and at most 40 known plus new classes overall (`maxActiveClasses`). Over the overall limit a candidate is skipped as `class pool full`; over a window limit as `focus window full` / `later window full`. Series dedupe for classes uses a 0.8 title similarity. Their match reasons include "A class you can sign up for".
- Ranking targets up to 3 picks per day in the 14-day focus window and 1 per day later. The count includes the household's active recommendations (withdrawn ones and responses of not-interested or dismissed are excluded), so a day already full is skipped.
- Same-series dedupe: a candidate whose title is at least 0.6 similar to an already picked or known recommendation is dropped.
- Events without coordinates are geocoded in `discover.ts` from the event's own public location (venue, address, city, region, country) only, never the household address. A miss or error keeps the event unchanged (`geocodeHits` / `geocodeMisses` in the run stats).
- Explanations run in consecutive Haiku batches of 12 picks, with a template fallback per failed batch.

Drive estimate (`geo.ts`): `estimateDriveMinutes(km) = round(10 + km * 1.25 * 60 / 65)` from the straight-line distance (10 minutes overhead, 1.25 road factor, 65 km/h average; no routing service). `tripTypeFor` maps minutes to a type using `TRIP_DRIVE_LIMITS`: local under 45, day trip under 90, weekend under 150. Discover sets `driveMinutes` and `tripType` on every ranked recommendation that has a distance (beyond 150 minutes it is labelled `weekend`). Trip research rejects a destination over its type's limit (day trip 90, weekend 150).

Ticketed shows: `planSearchTasks` adds one `ticketed-shows` task in the `near` window (music-performance, arts-culture and family-entertainment, minus categories every household avoids). Its prompt asks for ticketed concerts, shows and theatre suited to the household's ages, with price ranges and ticket URLs, and states a price ceiling (the highest `maxTicketPrice` in the area). Ranking skips a ticketed, non-free candidate whose cheapest price (`minPrice`, else `maxPrice`) is above the household's `maxTicketPrice` with the reason `over ticket price limit` (visible in `skippedByReason`); ticketed picks are explained as "Ticketed show, from <currency> <price>".

Trip ideas (`trips.ts`, `trips-run.ts`): run at the end of each `all` run (not `discover`, `refresh` or `watch`), after discover and refresh, for every sharing household. Skipped for `--dry-run`.

- The pool holds at most 3 active trips (`EVENTS_LIMITS.maxActiveTrips`) per household, and only while `tripsEnabled` is true. At most one new trip is researched per household per `all` run (one Haiku session), alternating weekend and day trip based on what the pool already holds.
- A trip is a normal recommendation with `trip` set, dated to the next Saturday in the household's timezone (weekends also Sunday). Once its end date has passed it is re-dated and re-published for the next Saturday, so it is re-suggested every weekend until it is retired.
- A trip is retired when the household answers `going` and the trip is past, answers `not-interested` or `dismissed`, or it is withdrawn.
- Trip events are kept out of the shared events table: they live only in the household's `recommendations.published_json` row in the local DB, so no other household sees them.
- A trip failure never changes the exit code. It adds `trips.failed` to the run outcome, and `notify.ts` sends a normal-urgency "Events trip ideas failed" notice with the failed count, active and new trips.
- The prompt carries city and region, the household profile lines, liked and avoided categories, the ticket ceiling and the titles of existing trips; never the street address, names or birthdays. Run stats carry `trips` (`households`, `active`, `refreshed`, `created`, `retired`, `failed`).

Cost caps: `--max-sessions` caps Haiku sessions per phase, not per run: in `all`, discover, refresh and trips each get their own runner and their own budget, so a long discover cannot starve the trips. The run stats `haiku` sums the three. Default 45 for `discover`/`refresh`/`all`, 20 for `watch`. Every `claude -p` call pins `--model claude-haiku-4-5-20251001` with read-only web tools; rate-limit or budget errors stop the run. A lock file `<EVENTS_DB_PATH>.lock` prevents overlap (stale after 2 hours). `discover`, `refresh` and `all` wait for the lock up to 20 minutes (40 tries, 30 seconds apart) so the daily run does not lose to a long watch run. If another run held it the whole time, the run prints `{"skipped":"locked","waitedMs":...}`, sends a critical notice and exits 1. `watch` does not wait.

Area key: households are grouped for shared searches by `city|countryCode` (`areaKey` in `geo.ts`; city and country are canonicalised, region is dropped on purpose). On open, the local DB converts older `city|region|country` keys to this form once.

Config (env file, mode 0600, via `EVENTS_ENV_FILE`): `FF_BASE_URL`, `FF_SERVICE_TOKEN`, optional `EVENTS_DB_PATH`, `CLAUDE_BIN`, `NOMINATIM_USER_AGENT`. Missing config exits 2.

Cron: `services/events-pipeline/crontab.example` installs two jobs by hand (`crontab -e`):

- Watch, every 5 minutes (`events:run -- watch`): one HTTPS request lists the households; a household-only discovery starts for each one that is new (no local row), re-shared, changed its address, or was never discovered. A household is skipped for 30 minutes after it was last triggered, and at most 3 households run per tick (the rest wait for a later tick). An idle tick makes no Claude session. Watch caps Haiku sessions at 20 per household run by default.
- Daily at 05:30 America/Los_Angeles (`events:run -- all`): discover plus re-check of known events for every household.

The systemd timers in `services/events-pipeline/systemd/` are the alternative to cron: `family-frame-events-watch.timer` every 5 minutes and `family-frame-events-daily.timer` daily at 05:32 (it catches up after the machine was off or asleep).

Dry run: add `--dry-run` to search and rank without publishing (`refresh --dry-run` only counts due events). `status` prints household and upcoming-event counts and recent runs, with no addresses or tokens. Always dry-run one household before enabling cron.

`report` (`events:run -- report [--household <id>] [--runs <n>]`, default 10 runs) prints a Markdown profile from the local DB to stdout. It needs no `FF_*` config, takes no lock and makes no network calls. Sections:

- **Runs**: one row per recent run (kind, start, duration, ok/error/running, Haiku sessions, cost USD, searches, candidates, normalize rejected, ranked, published). Watch rows sum their per-household discover stats; cells without data show `-`.
- **Where candidates were lost**: for the latest run with discover stats, the top normalize reject reasons, search failures, skipped-by-reason counts and phase timings.
- **Recommendations**: per household (or the one given), last discovered/triggered and up to 30 published recommendations (title, start, category, match, distance, status, response), then cost per published recommendation.

The report contains no address, coordinates, profile or tokens.

Run stats (`runs.stats_json`, also the printed JSON line) carry: `haiku` (`sessions`, `costUsd`), `normalizeRejected` (+ `normalizeRejectReasons`), `searchFailures` and `skippedByReason` (counts by reason), `ranked`, `closeToHome` (ranked picks that are close to home) and `phaseMs` (`prepare`, `search`, `rank`, `explain`, `publish`, in milliseconds). A non-dry `all` run also carries `pruned`: counts of local rows removed by `pruneLocalState` (`events`, `recommendations`, `searchLog`, `runs`).

Local retention (`pruneLocalState` in `db.ts`, once per daily `all` run): events and their recommendations are deleted 30 days after the event ended (or started, when it has no end), the search log after 30 days and run history after 90 days.

Data volume: Firebase keeps a household's active recommendations (cap 400) plus unanswered ones (`new`, `dismissed`) until 30 days after the event ends; answered ones (interested, going, maybe, not-interested) stay as history. The local SQLite DB is pruned daily as above, so neither side grows without bound.

Notifications: `watch`, `discover`, `refresh` and `all` send desktop notices through `notify-send` (rules in `notify.ts`). Per household: a normal notice with published/candidates (and cost) after a successful run, a critical one when that household's run failed. Per job: a critical `failed` notice on the first failure or when the error text changes; the same unchanged failure repeats as `still failing` at most once per 24 hours; the first success after failures sends `recovered`. `all` also sends a low-urgency daily summary (published, candidates, errors, cost). Failure state is kept per job in the local DB (`notify_state`). Notices hold only ids, counts, costs and clipped error text. Set `EVENTS_NOTIFY=off` to disable them; a missing `notify-send` or desktop session is ignored and never fails a run.
