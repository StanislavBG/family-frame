# Validation: photo cache plan

Base: 539be4cce24782f4f875f568e06d6957f42f1f5d (ancestor of HEAD). PRD commits: 8a22ff2 (45), e7973a6 (46), d56cd83 (47), 043f3b6 (48).

Environment note: the job worktree has no node_modules. I symlinked the main checkout's (removed afterwards). `npm run check` reports only `server/index.ts(8,48): Cannot find module '@clerk/express'` (that dependency is missing from the main checkout's node_modules, unrelated to this plan); no other type errors. `npm run build` exits 0.

## photo-cache-store — VERIFIED
- `createPhotoCache`, `PhotoCacheDeps`, `photoCacheKey`, lazy default `photoCache`: server/photo-cache.ts:19-148 (Firebase touched only inside `defaultCache()`).
- Key encoding: server/photo-cache.ts:22 `encodeURIComponent(id).replace(/\./g,"%2E")`.
- cachePhoto: `=w1920-h1080`, Bearer header, `AbortSignal.timeout(20000)`, image/ check, 8 MB header + body check, set payload `{data,mimeType,size,cachedAt}`, warn+false on failure (photo-cache.ts:30-68). Extra: rejects non-Google baseUrl via `isAllowedGooglePhotoUrl` (hardening, tested).
- cachePhotos worker pool + per-user in-flight Map deleted on settle (photo-cache.ts:70-95); get/remove/removeAll (photo-cache.ts:97-114).
- Gate: `npx tsx --test server/photo-cache.test.ts` → 9 pass, 0 fail. `npm run check` only the unrelated @clerk/express resolution error (see note).

## cache-photos-on-pick — VERIFIED
- shared/schema.ts: `cachedAt: z.number().optional()` on storedPhotoSchema, `cached: z.boolean().optional()` on googlePhotoItemSchema.
- Poll route: `toCache = photos.filter(p => !existingById.get(p.id)?.cachedAt)` (server/routes.ts:2285), `photoCache.cachePhotos(userId, …, accessToken)` (2287), upgraded existing + new entries with cachedAt only on success (2295-2308), single updateUserData with `pickerSessionId: sessionId` (2313-2320); failed downloads still stored; responds `{success:true}`-style unchanged.
- Gate string check (`cachePhotos(` in routes.ts) present; photo-cache tests pass.

## serve-cached-photos — VERIFIED
- GET /api/photos/:photoId/image (server/routes.ts:2487-2509): 401 without header, 404 JSON when absent, Content-Type from store, `Cache-Control: private, max-age=31536000, immutable`.
- Isolation: the only identity input is `req.headers["x-clerk-user-id"]`; path is `photoCache/${userId}/${photoCacheKey(photoId)}` (photo-cache.ts:98-99). `photoId` is URL-encoded so `/`, `.` cannot traverse to other users' nodes. server/auth.ts:58 deletes any client-supplied `x-clerk-user-id` and re-sets it from verified Clerk/PAT identity (auth.ts:88,107). A user can only read their own cache path.
- GET /api/photos: cached items returned with same-origin URL, `cached:true`, `fetchedAt: cachedAt`, Google only consulted when uncached photos exist (routes.ts:2407-2477); token-missing no longer hides cached; `needsSessionRefresh` only when zero displayable; `uncachedCount` added.
- DELETE removes single/all cache (routes.ts:2579-2581).
- Gate: key-string check passes (all four strings present); tests pass; check caveat as above.

## photos-client-use-cache — REFUTED — photos.tsx `getPhotoSrc` calls itself for uncached photos (infinite recursion)
- client/src/pages/photos.tsx:48-50: `return photo.cached ? photo.baseUrl : getPhotoSrc(photo);` — the else branch recurses instead of calling `getProxiedPhotoUrl(photo.baseUrl)` (screensaver.tsx:101-103 is correct). For any photo without `cached` (legacy/uncached or the refreshed-URL path at photos.tsx:110), the call throws RangeError (stack overflow). tsc cannot catch this. Criterion 1 ("existing proxy URL otherwise") fails for photos.tsx.
- Other criteria hold: `isUrlExpired` returns false for cached (photos.tsx:78); `uncachedCount?` added (photos.tsx:440); card title "Re-select Your Photos", reworded body, button "Select Photos" with `button-change-photos` (photos.tsx:569-593); screensaver short-circuit correct.
- Gate: `npm run build` exits 0 and the node string check passes, but the gate does not exercise the uncached path, so it is green despite the bug.

## Findings
### Critical
- client/src/pages/photos.tsx:49 — `getPhotoSrc` recurses infinitely for non-cached photos; fix: `getProxiedPhotoUrl(photo.baseUrl)`. Affects the Picture Frame for every user with not-yet-cached photos (and the refresh path for them).
### Important
- none
### Minor
- Plan has no client test; a trivial unit test for `getPhotoSrc` would have caught the Critical.
- server/index.ts:8 imports `@clerk/express`, which is absent from the main checkout's node_modules (environment, not plan).
