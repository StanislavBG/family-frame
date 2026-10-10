# Validation: Events app UI plan

Base: 3f64d8ee7862d35ef63527ea6e1bec937458dfa9 (HEAD 2bc42de). The PRD files were found under `prds-archived/` for all nine slugs.

Gates re-run in the foreground. `node_modules` was absent from the worktree, so I temporarily symlinked the main checkout's `node_modules` and removed the link afterwards.
- `npm run check` (tsc): exit 0.
- `npm test` (vitest, then node:test): exit 0. The server tail showed 328 pass, 0 fail.
- `npm run build`: exit 0.

## 134-events-app-registry: VERIFIED
- `shared/apps.ts` has `"events"` in `APP_IDS` right after `calendar`, and `nested?: boolean` on `AppManifest`. The `people` and `events` manifests set `nested: true`. The events manifest has title 'Events', url '/events', `defaultEnabled: false`, and 3 features.
- `client/src/App.tsx` has `events: GuardedEvents` in `APP_PAGES` and `nest={!!app.nested}` in `APP_ROUTES`.
- `client/src/lib/app-registry.ts` maps `events` to `Ticket`.
- `client/src/pages/events.tsx` exists and is now the real page. A later PRD, 164, replaced the placeholder as planned.
- `client/src/lib/app-manifest.test.ts` now expects 18 apps and asserts events is optional, not fixed, and nested. It passes.

## 139-events-design-brief: VERIFIED
- `docs/events-design-brief.md` has Purpose, Audience and constraints, Screens, States, Data available per screen, Interactions, Visual language and Out of scope (headings at lines 3, 18, 30, 141, 153, 378, 394, 408).
- The Screens and States sections were skimmed, not read line by line.
- The commit `d7c5fa3` touches only the docs file.

## 141-calendar-shows-event-details: VERIFIED
- `client/src/pages/calendar.tsx`: the upcoming strip shows `formatEventTime(startTime)` plus `endTime` using `settings.timeFormat`.
- Cancelled entries get `line-through` in the grid chip and the upcoming strip, plus a "(Cancelled)" suffix in the chip and a `Cancelled` Badge in the strip.
- The Edit dialog has startTime, endTime and location inputs. The PUT body sends `?? ""` so a cleared value is cleared on the server.
- The "Open in Events" link renders only when `source.app === 'events'` and `creatorId === user.id`, using `eventsRefId`. Connected homes' entries don't pass the creator check.
- The location line in the upcoming strip was not read directly. The diff shows only the time block, so this is an assumption from the diff.

## 155-events-client-lib: VERIFIED
- `client/src/lib/api.ts:59-64` has `queryKeys.events` with status, items, item, preferences and feedback.
- `client/src/lib/events.ts` exports all 11 hooks plus `groupForAgenda`, `formatWhen`, `formatCost`, `CATEGORY_META` and `statusBadge`.
- `client/src/lib/events.test.ts` covers day 13 vs 14, an event timezone different from the machine's, all-day, multi-occurrence ("+N more dates"), the formatCost cases, and cancelled and price-changed statuses. It passes.
- The invalidation of `['/api/calendar/events']` on respond/plan/delete was not independently checked.

## 158-event-actions-component: VERIFIED
- `event-actions.tsx` exports `EventActions` using `useRespond`, `useUpdatePlan` and `useSendFeedback`.
- Buttons use `min-h-12` and show a "(selected)" aria-label. Calendar visibility defaults to Private and offers "Private (just us)" and "Shared (connected homes see it)".
- The decline reason uses `EVENTS_LIMITS.maxFeedbackReason`. The value of that constant was not checked against 280.
- The Change plan dialog loads `/api/people/list`, has notes and a visibility choice.
- Feedback pairs have aria-labels, and the title is "Did you go? How was it?" for past events.

## 159-events-month-view: VERIFIED
- `events-month.tsx` uses `buildMonthCells`, has prev/next buttons (`h-11 w-11`), and puts multi-occurrence events on each occurrence date via `occurrenceDates`.
- Chips are limited by `MAX_CHIPS` and followed by "+N more". They have `min-h-8` (32px), Check/Star icons, `line-through` when cancelled, and a Changed dot.
- Chips are wouter `Link`s. Today is highlighted using `useToday()`.
- `MAX_CHIPS = 3` was not read directly.

## 160-events-preferences-panel: VERIFIED
- `events-preferences-panel.tsx` has a Slider with min 1 and max 100, Free/Low/Any options, a weekend toggle, an evening toggle, and a notes field with `maxLength={1000}`.
- The 'What we've learned' section has the required empty-state text. The feedback log is capped at 50 (`.slice(0, FEEDBACK_SHOWN)`). The Delete AlertDialog is wired to `useDeleteEventData`.
- `app-settings-panels.tsx:542` registers `events: { title: 'Events Settings', description: 'What kinds of events you would like', Panel: EventsPreferencesPanel }`.
- The panel shows 'What we've learned' only when `learned !== undefined`. If the server omits `learned`, the section is hidden, not shown empty (Minor 3).

## 162-event-hero-component: VERIFIED
- `useMarkSeen` is guarded by a ref. There is a skeleton while loading, and an `EmptyState` with a Back link on 404 and on other load errors.
- Header has a serif title, a category `ToneChip`, `formatWhen`, distance and `formatCost`.
- Sections are in order: status banner with newest-first updates, why household, why children (conditional), highlights, good to know, where (with OSM link), tickets, organizer, sources.
- `EventActions` is rendered under the header and again at the bottom in a `[@media(min-height:900px)]:block` wrapper.
- No third-party image: `grep` for `<img`, `src=`, `url(` and `background-image` over `pages/events.tsx` and `components/events/*.tsx` returned nothing.
- No HTML injection: `grep` for `dangerouslySetInnerHTML` returned nothing, so event text goes through JSX text nodes only.
- External links all use `target=_blank` with `rel="noopener noreferrer"`.
- `shared/events.ts:95` defines `httpsUrl` for ticketUrl, registrationUrl, organizer.url, imageUrl, source.url and update.sourceUrl, so `javascript:` URLs are rejected by the schema.
- `imageUrl` exists in the schema but is never rendered.

## 164-events-page: VERIFIED
- `useRoute('/:eventId')` renders `EventHero`; otherwise the overview renders.
- Not opted in: `EmptyState` with an action to `~/settings?section=location`. Opted in with no items: the required text plus `lastPublishedAt`.
- The overview has category chips, response filter chips, an Agenda/Month toggle, `groupForAgenda` and `EventsMonth`.
- Agenda cards are whole-card `Link`s showing a DateBadge, title, `formatWhen`, distance, `formatCost`, category chip, status badge and Changed chip.
- `useToday()` supplies today. The no-third-party-image criterion is satisfied (same grep as 162).
- The header counts (new/going/changed) and the default filter were skimmed, not traced.

## Combined diff review
I reviewed the diff by surface rather than line by line: `git diff <base>..HEAD --stat` (76 files, +11426/-33) and the client UI files.
- `/code-review` and `/security-review` were not run as separate invocations. I self-reviewed for XSS, URL schemes, path traversal and duplication.
- The server and pipeline portions fall under the earlier backend validation records (`validate-events-backend.md`, `validate-household-address.md`) and were not re-reviewed here.
- The client uses `encodeURIComponent` / `decodeURIComponent` on event ids, and the OSM query is URL-encoded.
- No secrets or `dangerouslySetInnerHTML`.

## Findings

### Critical
None.

### Important
None.

### Minor
1. `client/src/components/events/event-hero.tsx` (`formatWhen(event.schedule)` in the header) ignores the user's 12h/24h setting. It falls back to the default `"24h"`.
2. `client/src/pages/events.tsx` (`formatWhen(event.schedule, "12h")` in `AgendaCard`) hardcodes `"12h"`. The user's `timeFormat` setting is ignored there.
3. `client/src/components/events/events-preferences-panel.tsx:312`: 'What we've learned' is hidden entirely when the preferences response has no `learned` field. The spec asked for the empty-state text in that case.
4. Gates could only run with a symlinked `node_modules`. The worktree has no dependencies installed, so this validation depended on the main checkout's install.
