# Validation: household address and consent

Base: 3f64d8ee7862d35ef63527ea6e1bec937458dfa9 (`git log --oneline <base>..HEAD` over each PRD's files). All PRD files found in `prds-archived/`.

Gates re-run in the worktree (node_modules symlinked from the main checkout, since the worktree has none):
- `npx tsx --test server/household-schema.test.ts server/household-profile-service.test.ts server/household-routes.test.ts` → 25 pass, 0 fail
- `npm run check` → exit 0
- `npm test` → vitest 8 files / 75 tests pass; node:test 314 pass, 0 fail
- `npm run build` → exit 0

## 130-household-address-schema — VERIFIED
- Commit 844e30e. `shared/household.ts:5-17` strict address schema with the specified limits and timezone regex; type at :19.
- `isAddressComplete` at :21 (line1/city/country trimmed non-blank).
- `EVENTS_SHARING_CONSENT_VERSION = 1`, `EVENTS_SHARING_CONSENT_TEXT` (text matches the notes), `eventsSharingSchema`, `consentLogEntrySchema`, `householdProfileSchema` (default `{enabled:false}`), `putEventsSharingSchema` (.strict()) and the four types all exported.
- `server/household-schema.test.ts` passes (part of the 25 above). `shared/schema.ts` locationSchema not touched for the address.

## 135-privacy-page-events-sharing — VERIFIED
- Commit b125d27. `client/src/pages/privacy.tsx` adds a `<section className="mb-8">` titled "Household address and event recommendations", same markup as the other sections.
- Text covers every point: optional and private, never shown to connected homes; shared only after "Share address for event recommendations"; address, ages (not names or birthdays), preferences and feedback; runs on the operator's computer; Anthropic Claude sees city and area only; Nominatim for coordinates; turning off stops recommendations and the service deletes the household on its next run; households can delete event history from Events settings.
- `npm run check` exit 0.

## 136-household-profile-service — VERIFIED
- Commit 14ae064. `server/household-profile-service.ts`: `createHouseholdProfileService(deps)`, deps shape matches, default `householdProfileService` on `getFirebaseDb()` (:127-).
- `getProfile` defaults sharing to disabled (:62); `putAddress` returns HouseholdProfileError 400 on a zod failure (:90-95).
- `setEventsSharing` (:104): same value is a no-op; enabling an incomplete address gives 409 with the exact text; enabling sets consentVersion and consentedAt and drops revokedAt; disabling sets revokedAt; each change logs to `consentLog`.
- `writeAddress` (:73-86) revokes and logs when sharing is on and the address becomes incomplete. This is only reachable through `clearAddress`, because `putAddress` schema-rejects incomplete addresses.
- `listSharingHouseholds` (:117) filters on enabled, complete address and matching consentVersion; it uses safeParse and skips malformed entries.
- `stripUndefined` is applied before writes.
- Tests pass (part of the 25 above).

## 142-household-profile-routes — VERIFIED
- Commit 67300e1. `server/household-routes.ts`: `registerHouseholdRoutes(app, service, userDeps)` with GET profile, PUT address and PUT events-sharing. The handler returns 401 with no user and 403 when `x-ff-auth !== "session"` (:20-27), maps HouseholdProfileError to its status (:32) and ZodError to 400 (:36).
- PUT address syncs `settings.location = {city, country}` (:53-56).
- `server/routes.ts:125` registers the routes right after the settings routes.
- `/api/connections` (routes.ts:312-317) now projects `location` as `{city, country}` only. Street address lives under `householdProfiles/<id>`, not `settings`, so it is never returned. I found no other path that reads the address.
- The snapshot diff adds exactly the 3 routes.
- Tests pass: 314 node:test plus the route tests.

## 148-settings-address-and-consent-ui — VERIFIED
- Commit 440f9fa. `client/src/lib/household.ts` exports `useHouseholdProfile` (key `['/api/household/profile']`), `useSaveAddress` (invalidates profile and `/api/settings`), `useSetEventsSharing` (shows the server error text in a toast on 409), and pure `buildAddressPayload` (trims, drops empty optionals, adds the timezone). `household.test.ts` passes under vitest.
- `settings.tsx`: Street address, Address line 2 (optional), Postal code and Region/State (optional) fields with labels and data-testids, plus the "Private: only shared with the events service if you turn it on below" label. Save uses `useSaveAddress` when a street address is present, otherwise the old PATCH.
- "Event recommendations" card shows the consent text and the labelled Switch. The switch is disabled with the hint when the address is incomplete, and "Sharing since <date>" shows when on. Inputs prefill from the profile and fall back to settings.location. Text is not hover-only; the card uses theme tokens, so it works in light and dark.
- `npm run check`, `npm test` and `npm run build` pass.

## Findings
### Critical
- none
### Important
- none
### Minor
- `client/src/pages/settings.tsx` `handleSaveLocation`: emptying the Street address field cannot clear a saved address. `line1 ?? profile…` keeps `""`, so it falls back to the PATCH path and the address stays. `clearAddress` exists in the service but has no route or UI. This is not required by any criterion.
- `shared/household.ts:7-9`: `line2`, `region` and `postalCode` are not trimmed by the schema. The client trims them, but PAT or API callers could store whitespace-only values.
- `server/household-routes.ts:51-57`: the address save and the settings.location sync are not atomic. If the second write fails, the profile is saved but the weather city is stale. The user can retry.
