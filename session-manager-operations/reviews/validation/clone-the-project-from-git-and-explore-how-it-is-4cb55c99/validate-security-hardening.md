# Validation: security hardening plan

Base: 3c532e71 (the base range also includes unrelated agent-access/photos/chores work; only the five security PRDs were judged).
Gates re-run on HEAD 18b2076: `npm ci`, `npm test` (vitest + `tsx --test`, 62 tests pass, 0 fail), `npm run build` (exit 0). `npm run check` was not run.
All five commits are on origin/main (`git branch -r --contains 18b2076` = origin/main).
Not run: the server was never booted (the local .env points at production Firebase). "Boots without SESSION_SECRET" is verified by reading the code only: `SESSION_SECRET` is read only inside the two Google OAuth handlers (server/routes.ts:1901, :1938), and nothing reads it at module load.

## auth-header-spoof-hotfix — VERIFIED
- Commits 70d146e / 9a81c92 (`fix(auth): strip client-supplied identity headers`) are on origin/main.
- server/auth.ts:57-58 deletes `x-clerk-user-id` / `x-clerk-username` first on every request. The factory was later renamed `createSessionHeaderMiddleware` (PAT work). The behaviour is the same, and the unused `requireAuth` is gone.
- server/index.ts:42-58 wires the middleware; the inline code is removed.
- vitest.config.ts exists, `test` script present, server/auth.test.ts covers the cases; tests pass.
- Deviation: the `test` script is `vitest run && tsx --test server/*.test.ts` (from a later PRD).

## server-logging-and-auth-scope — VERIFIED
- cc56e51 is on origin/main.
- server/index.ts:76-86: the logger records method, path, status and duration only. No body is captured.
- server/auth.ts: `!req.path.startsWith("/api")` returns `next()` before any verifyToken/getUser call, after the headers are stripped.
- server/auth.ts: 5-minute TTL `usernameCache` with injectable `now`.
- server/index.ts:100-105: the error handler returns early on `headersSent` and does not rethrow.
- Tests for the non-/api path and the cache are in server/auth.test.ts (passing).
- Minor: the logger only logs `/api` paths, which is stricter than the PRD and fine.

## photos-proxy-ssrf-lockdown — VERIFIED
- 965e96f is on origin/main.
- server/url-guards.ts:11-21 allows https only, rejects userinfo, and requires host == googleusercontent.com or a subdomain. This rejects IP literals, `@evil.com` tricks and `googleusercontent.com.evil.com`. Tests are in url-guards.test.ts.
- server/routes.ts:2565 returns 400 before the token lookup at :2570. Fetch uses `redirect:"manual"` and `AbortSignal.timeout(10000)` (:2584-2585). The 15 MB cap is enforced on Content-Length (:2595) and on streamed bytes (:2614). `Cache-Control: private, max-age=3600` is set at :2603.
- `/api/google/status` is registered only inside `if (NODE_ENV !== "production")` (:1996 and the guard above it).
- Client only proxies Google Photos URLs (photos.tsx:44, screensaver.tsx:97).

## google-oauth-state-hardening — VERIFIED
- e2db9bc is on origin/main.
- server/oauth-state.ts: HMAC-SHA256, `timingSafeEqual`, 10-minute TTL, nonce must equal the cookie. Tests cover the round trip, wrong nonce, expired, tampered and wrong secret.
- routes.ts:1901-1905 and :1938-1942 return 503 `{error:"Google Photos sign-in not configured"}` when SESSION_SECRET is unset. The fallback secret is gone (grep shows only those two reads).
- The `ff_oauth_nonce` cookie is set httpOnly, lax, secure in production, maxAge 10 min (:1920-1926). The callback clears it regardless of outcome (:1948-1953).

## radio-media-proxy-hardening — VERIFIED
- 18b2076 is on origin/main.
- `isAllowedStreamUrl` (url-guards.ts:25-39): http(s) only, no userinfo, no IP literals or bracketed hosts, host equals or is a subdomain of an allowed host. Tests are present.
- `/api/media/proxy` uses `ALLOWED_STREAM_DOMAINS` (routes.ts:774) and `fetchFollowingAllowed` (:819-846). That helper uses manual redirects, a max of 3 hops, re-checks every Location and throws `DisallowedRedirectError`, which gives a 502.
- `/api/radio/metadata` (:1540-1600): the allowlist is the shared list plus station hosts (:1544-1551), with 400 on a disallowed URL. One `AbortSignal.timeout(5000)` covers fetch and the body loop, and the read is capped at 64 KB.
- Media pump: `await pipeline(Readable.fromWeb(body), res).catch(...)` (:947) and `res.on("close", () => upstream.abort())` (:878). The `cancel()` calls are `.catch`ed.
- Response shapes of both endpoints are unchanged.

## Combined regression review
- Routes the plan touched keep their response shapes: `/api/photos/proxy` (image bytes, with new 400/413 error cases), `/api/media/proxy`, `/api/radio/metadata` (same JSON fields), `/api/google/auth-url` (`{url}`), and the callback redirects.
- `/api/google/status` is now absent in production (404). It is a debug endpoint, and the client call sites were not re-checked.
- Self-review found no secrets, path traversal, or helper duplication. `/code-review` and `/security-review` were not run as separate skill invocations.

## Findings
### Critical
- none
### Important
- none
### Minor
- server/routes.ts:2614-2620 `/api/photos/proxy` buffers up to 15 MB in memory per request, which is acceptable at this scale.
- server/routes.ts:871: `/api/media/proxy` keeps its own hostname check rather than calling `isAllowedStreamUrl` for the first hop. The redirect hops do use it, and the two checks are equivalent in effect.
- server/routes.ts:1950-1960: an auth-url call without a prior nonce, or with an expired one, redirects with `invalid_state`. This is correct behaviour.
- `/api/google/callback` with a `code` but no `state` goes to `auth_failed`, so no fallback identity exists.
- The "pushed to origin main" criterion was checked by commit presence on origin/main, as listed above.
