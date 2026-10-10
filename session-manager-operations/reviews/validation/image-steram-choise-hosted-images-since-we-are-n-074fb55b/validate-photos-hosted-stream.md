# Validation: photos hosted stream

Base `848fa4c` (history between base and HEAD includes unrelated Events commits; plan commits are c669607, 0c5ee17, cc419db, 1a3cb59, a1bc3c0). PRD 172 file was still in `prds/` (not archived); judged against the tree.

## Verdicts

VALIDATION: 169-media-list-person-any VERIFIED
VALIDATION: 170-photos-hosted-settings-schema VERIFIED
VALIDATION: 171-photos-hosted-stream VERIFIED
VALIDATION: 172-photos-hosted-settings-ui VERIFIED
VALIDATION: 173-people-delete-prunes-photo-stream VERIFIED

## 169 media-list-person-any (c669607)
- `personIds?: string[]` in ListMediaOptions: server/media-store.ts:71-72; any-of Set filter at :271,:277. `[]` yields an empty Set, so nothing matches; omitted skips the filter. Filter sits with the AND filters before sort/total/limit.
- Test `listMedia filters by any of several personIds`: server/media-store.test.ts:214. Passes.

## 170 photos-hosted-settings-schema (0c5ee17)
- `PhotoMediaScope` exported: shared/schema.ts:80; both keys `.optional()` at :250-251 using `personIdsSchema` (max 20, 1-128; no import cycle, `npm run check` passes).
- Test `settings: hosted photo scope`: server/routes-validation.test.ts:102. Passes.

## 171 photos-hosted-stream (cc419db)
- server/photo-hosted-media.ts exports mediaToPhotoItems, PHOTO_STREAM_MAX=2000, resolveStreamPersonRefs (null for non-people; id + name per valid person; unknown dropped; none -> []), createHostedPhotoSource (`[]` returns before any store call :48; pages with offset until total/cap/MAX_PAGES).
- server/apps/photos.ts:511-513 uses the adapter; no `media-store` import, no mediaToPhotoItems.
- Separation: `grep media-store server/apps/photos.ts` -> no match (clean). `grep -i photo server/media-store.ts` -> one hit, line 7, a pre-existing comment referencing `photo-cache.ts` (the RTDB cache analogy), not a Photos-app dependency. No code coupling.
- Tests: server/photos-agent-media.test.ts, route-inventory.test.ts pass.

## 172 photos-hosted-settings-ui (1a3cb59)
- client/src/lib/photo-stream.ts: togglePersonId (cap 20) and hostedStreamLabel; 5 vitest tests pass.
- Panel: label "Hosted images", Show select (`photo-hosted-scope`), per-person checkboxes (`photo-hosted-person-<id>`), empty-registry hint: app-settings-panels.tsx ~L392-440.
- app-settings.tsx:47-51 invalidates ["/api/photos"] on any of the three keys.
- photos.tsx:516-531 empty states per spec.
- New classes are only `text-xs text-muted-foreground`/layout utilities; no new light colour class, so no dark pair needed.

## 173 people-delete-prunes-photo-stream (a1bc3c0)
- server/people-refs.ts pure, non-mutating, scope untouched; tests (server/people-refs.test.ts) pass.
- server/routes.ts DELETE handler uses removePersonRefs and one updateUserData({people, events, settings}).
- docs/agent-access.md section 11 renamed "Hosted images" with scope, id-or-name matching, 2000 cap, privacy.

## Review focus
- No change to server/auth.ts, server/mcp.ts, server/media-routes.ts (`git diff --stat` empty); no new route (route-inventory test passes).
- people scope with no valid ids -> `[]` -> empty stream (photo-hosted-media.ts:48), never the household.

## Gates
- `npm test`: vitest + 341 node:test tests, 0 fail. `npm run check` (tsc): clean. (node_modules symlinked from the main checkout; untracked/ignored.)

## Findings
### Critical
- none
### Important
- none
### Minor
- server/routes.ts DELETE handler passes `settings` straight to RTDB `update()`; if a user record had no `settings`, `undefined` would make the Firebase admin SDK throw. Default users always get settings (server/default-user.ts:13), so unlikely in practice.
- client/src/pages/photos.tsx:519: with people scope and nobody chosen, the title reads "No hosted photos for No one chosen" (description carries "Choose people in Photos settings."). Awkward copy, harmless.
- PRD 172 file remained in `prds/` rather than archived at validation time.
