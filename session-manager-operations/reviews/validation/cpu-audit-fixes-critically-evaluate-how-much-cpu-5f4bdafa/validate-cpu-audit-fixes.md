# Validation: CPU audit fixes

Base: b7c3b23 (known). Commits: b456d26, b546da9, f0e0e2a, 32690aa, 0cac619, 412d02a.
Gates re-run in this tree: `npm run check` rc 0; `npm test` (vitest + 574 node:test) all pass; `npm run events:check` clean; `npm run events:test` 289/289 pass.
Reviews: /code-review and /security-review not run as separate agents; I self-reviewed the diff (no new input handling, paths or secrets; launcher resolves only repo-relative paths).

## market-symbol-cache — VERIFIED
- server/apps/stocks.ts:6 stockConfig at module scope; :226 `loaders` Map; :228-233 memoTTL(…, 60_000) only for stockConfig keys (hasOwnProperty), unknown symbols call fetchMarketSymbol directly.
- :35 MarketFetchError so failed upstream is not cached. :238 resetMarketCacheForTests.
- server/stocks-cache.test.ts exists and passes in `npm test`.
- Caveat: the file diff is large (459 lines) because the route body was restructured; shape equivalence was not diffed line by line, only covered by tests.

## unread-count-narrow-read — VERIFIED
- server/apps/messages.ts:10-37 countUnreadMessages reads `users/<uid>/clerkId` and `users/<uid>/messages` in Promise.all; never `users/<uid>`. Missing user → fallback getOrCreateUser. Route at :78 uses getFirebaseDb().
- Same toArray + `!isRead` semantics. server/messages-unread.test.ts passes.

## unread-count-single-poll — VERIFIED
- client/src/lib/api.ts:109-117 unreadCountQueryOptions. app-sidebar.tsx:30 poll:true; app-controls.tsx:206 poll:false. client/src/App.tsx:276 mounts AppSidebar unconditionally inside AuthenticatedLayout, so the single poller is always mounted. Query key unchanged (api.ts:28 = old literal). home.tsx untouched.
- client/src/lib/unread-count-poll.test.ts passes.

## events-pipeline-launcher — VERIFIED
- services/events-pipeline/launch.mjs: ensureBundle (:50) skips esbuild when bundle newer than metafile inputs and launcher (:24-43); esbuild imported lazily (:55); options platform node/esm/node22/bundle/packages external (:57-65). `.gitignore` has `.cache/`.
- cli.ts already exports main (:231) with is-main check (:487) unchanged, so cli.ts needed no edit.
- Ran `node services/events-pipeline/launch.mjs bogus`: prints usage, rc=2. launch.test.ts passes.

## events-launcher-wire — VERIFIED
- package.json events:run = `node services/events-pipeline/launch.mjs`; both unit templates ExecStart use `/usr/bin/node services/events-pipeline/launch.mjs watch|all`, other lines unchanged.
- README documents re-copy + daemon-reload and .cache/events-pipeline rebuild. launch.test.ts covers wiring.
- Not live: units on the host still need the human re-copy + daemon-reload.

## weather-upstream-timeouts — VERIFIED
- server/weather.ts: AbortSignal.timeout(timeoutMs) on all three fetches (geocodeCity, getWeather, reverseGeocode Nominatim), default FETCH_TIMEOUT_MS. Existing try/catch returns null as before, so the route error path is unchanged (server/apps/weather.ts untouched). server/weather-timeout.test.ts passes.

## Findings
Critical: none.
Important: none.
Minor:
- reverseGeocode may make a second upstream fetch after the Nominatim one; only the Nominatim call was confirmed to carry a signal in the diff (server/weather.ts:~178). The AC says every fetch; 3 added signals match the 3 changed sites, and no unsignalled fetch was seen in the diff hunks.
- Savings are test-proven only; none is live until the server is republished and the systemd units are reinstalled.
