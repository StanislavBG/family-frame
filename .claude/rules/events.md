---
paths:
  - "shared/events*.ts"
  - "shared/household.ts"
  - "server/household-profile-service.ts"
  - "server/household-routes.ts"
  - "server/events-*.ts"
  - "server/apps/events.ts"
  - "client/src/components/events/**"
  - "client/src/pages/events.tsx"
  - "client/src/lib/events*.ts"
  - "services/events-pipeline/**"
---

# Events and household address rules

- The street address lives only at `householdProfiles/<uid>` (`shared/household.ts`); never put it in `settings` or connections payloads (only city and country are copied to `settings.location`).
- `/api/service/events/` is service-token only (`ff_svc_`, hash in `EVENTS_SERVICE_TOKEN_SHA256`); every per-household route re-checks current consent (not sharing = 404).
- LLM prompts never contain the street address, names or birthdays; the service API sends member ages only.
- Every `claude -p` call pins `--model` via `services/events-pipeline/haiku.ts`.
- `services/events-pipeline` is Node 22 only (`node:sqlite`): keep it out of the root `npm test` and `npm run check`; use `npm run events:test` / `events:check`.
- Every published event needs an official source on the organizer's own domain (`shared/events-sources.ts`); never weaken it to raise volume.
- Read feedback entries only through `feedbackEntrySchema` in `listFeedback` (`server/events-service.ts`), never as a raw `FeedbackEntry`: RTDB drops empty arrays.
- `closeToHome` is derived at read time in `server/apps/events.ts`; never store it.
- Filter groups stay logical: When = days, What = kind, How far = distance; do not mix them.
- Ongoing classes (no dated session) stay off calendar days; they show in the day view's classes section and the classes shelf.
- Browse state uses `useSessionState` key `ff.events.browse.v1`, rebuilt with `parseBrowse`.
- Shared pure logic stays in `shared/events-visit.ts`, `shared/events-profile.ts`, `shared/events-sources.ts`, `shared/events-proximity.ts` and `shared/events-activity.ts`.
- Household profile and preferences are hints, not filters.
- Details: `docs/events.md`. Pipeline operation: `services/events-pipeline/README.md`.
