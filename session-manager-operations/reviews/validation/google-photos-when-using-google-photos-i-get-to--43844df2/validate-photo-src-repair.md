# Validation: photo-src repair

Base: bba781db9e7d7a1860bf2ecccdf108c213d54002. Plan commit: cce6137 (touches photo-src.ts, photo-src.test.ts, photos.tsx, screensaver.tsx).
PRD files found in `prds-archived/`.

## repair-photo-src-recursion — VERIFIED
- AC1: `client/src/lib/photo-src.ts:4-7` exports `getProxiedPhotoUrl` (`/api/photos/proxy?url=` + encodeURIComponent(`${baseUrl}=w1920-h1080`)); `:10-12` exports `getPhotoSrc` (cached ? baseUrl : getProxiedPhotoUrl(baseUrl)), typed `Pick<GooglePhotoItem,"baseUrl"|"cached">`. The "served from our own origin" comment is kept.
- AC2: the diff removes the local helpers from `photos.tsx` and `screensaver.tsx`. Both import `getPhotoSrc` from `@/lib/photo-src` (`photos.tsx:15`, `screensaver.tsx:9`). Call sites are unchanged (`photos.tsx:51,64,76,81,100,105,119`; `screensaver.tsx:108`). The recursive `getPhotoSrc(photo)` self-call is gone.
- AC3: `photo-src.test.ts` has 3 tests: cached returns baseUrl; uncached returns the proxy URL with `%3Dw1920-h1080`; uncached does not throw RangeError.
- AC4 / gate: `npm run check` exit 0; `npx vitest run client/src/lib/photo-src.test.ts` shows 3/3 passed; `npm run build` completed ("Done", dist/index.cjs 1018.2kb).

## photos-client-use-cache — VERIFIED (one gate artifact, see Minor)
- AC1: both pages resolve src through the shared `getPhotoSrc`, which returns baseUrl unchanged when cached and the proxy URL otherwise. The former infinite recursion is fixed.
- AC2: `photos.tsx:69` `if (photo.cached) return false;` in `isUrlExpired`, so refresh is skipped for cached photos.
- AC3: `photos.tsx:430` has `uncachedCount?: number`.
- AC4: `photos.tsx:559` body ("Google's access ... expired. Re-selecting them once will save them to Family Frame so this won't happen again."); `:575` title "Re-select Your Photos"; `:580-582` button `data-testid="button-change-photos"` calls `setAppSettingsOpen(true)` and is labelled "Select Photos" when needsSessionRefresh.
- AC5: check and build pass (above).
- Gate step 1 (check + build) passes. Gate step 2 (literal `.cached` substring in both pages) prints `HALT: no cached handling in client/src/pages/screensaver.tsx`, because the cached logic now lives in `photo-src.ts`. The behavior is present; this is a stale gate check, not a defect.

## Findings
### Critical
- none
### Important
- none
### Minor
- 48-photos-client-use-cache's gate step 2 would now fail on `screensaver.tsx` (no `.cached` substring) after the refactor into `photo-src.ts`. This is a gate artifact only. Do not re-run that gate verbatim.
- `photo-src.test.ts:19` the "does not throw RangeError" assertion is weak: `not.toThrow(RangeError)` passes for any non-RangeError throw. The second test already exercises the same path, so impact is low.
- Self-review of the diff (no `/code-review` run): no secrets or path traversal. The proxy URL is built with encodeURIComponent; server-side SSRF guards live in `server/url-guards.ts` and are untouched. No duplicated helper remains.
