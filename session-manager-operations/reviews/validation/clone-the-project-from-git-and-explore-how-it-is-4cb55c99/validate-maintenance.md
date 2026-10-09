# Validation: maintenance plan

Base: 3c532e71e52ee744162b5650850357f943211358. Checked on a tree identical to origin/main (042a581; `git diff origin/main HEAD` empty). Review tools were not run separately; the diff was self-reviewed.

## clerk-express-migration — VERIFIED
- Commit 5aafbcd `chore(auth): migrate to @clerk/express`, on origin/main.
- `grep clerk-sdk-node server package.json` → no hits; package.json:15 lists `@clerk/express`.
- server/index.ts:8 imports `createClerkClient, verifyToken` from @clerk/express; :32-35 creates the client with secretKey and the `VITE_CLERK_PUBLISHABLE_KEY || …` key chain; :55 `verifyToken(t, { secretKey })`.
- server/auth.ts:102 still reads `__session` / `__clerk_db_jwt`; server/auth.test.ts covers both (lines 90, 98).
- Gate: `npm test` exit 0, `npm run build` exit 0.

## dependency-security-updates — VERIFIED
- Commit c346f63 `chore(deps): security updates`, on origin/main.
- `npm audit --omit=dev --audit-level=critical` exit 0 (re-run).
- Majors unchanged vs base: express ^4.21.2, react/react-dom ^18.3.1, vite ^7.3.0, tailwindcss ^3.4.17, date-fns ^3.6.0, firebase-admin ^13.6.0; zod ^3.24.2 → ^3.25.76 (same major).
- Remaining highs (5 of 16 total vulns): braces, micromatch, chokidar (no upstream fix; dev-time glob chain via tailwind 3), tailwindcss ≤3.4.19 (fix needs tailwind 4), fast-glob (fixable via the same chain). The PRD asked for this list in the executor's report; it is reconstructed here from `npm audit --json`.

## dev-ergonomics-cleanup — VERIFIED
- Commit 345727e, on origin/main.
- package.json:7 dev script: `NODE_ENV=development tsx $([ -f .env ] && echo --env-file=.env) server/index.ts` — loads .env only when present (portable to Node 20).
- server/middleware.ts:75 `weekStartsMonday: true`; `npm run check` exit 0.
- drizzle.config.ts absent; `grep drizzle|connect-pg|from "pg"` over server/ shared/ client/src script/ hits only weather-code strings ("drizzle" descriptions); no overrides key left in package.json; db:push gone.
- Gate: test, check, build all exit 0.

## configurable-app-base-url — VERIFIED
- Commit 1262426 `feat(config): APP_BASE_URL for OAuth redirect`, on origin/main.
- server/config.ts exports `getAppBaseUrl()` (trims trailing slashes, defaults to the Replit URL).
- server/routes.ts:1960 and :2017 use `${getAppBaseUrl()}/api/google/callback`; no `replit.app` left in routes.ts or weather.ts.
- server/weather.ts:168 User-Agent uses `getAppBaseUrl()`.
- server/config.test.ts covers unset, set and trailing-slash (lines 18, 22, 26).
- Gate: test, build exit 0.

## claude-md-refresh — VERIFIED
- Commit 042a581 `docs: refresh CLAUDE.md`, on origin/main.
- Env var grep (`process.env.*|import.meta.env.*` over server client shared) yields 14 distinct names (VITE_CLERK_PUBLISHABLE_KEY counted once; NODE_ENV, PORT, REPLIT_DEPLOYMENT, TZ, SESSION_SECRET, PIXABAY_API_KEY, GOOGLE_*, APP_BASE_URL, PUBLISHABLE_KEY_*, CLERK_SECRET_KEY, FIREBASE_SERVICE_ACCOUNT). CLAUDE.md lists all, marked required/optional/tooling; DATABASE_URL gone.
- CLAUDE.md has `npm test`, the .env note, production-Firebase warning, Release line, Chores/Recipes/Screensaver, config/url-guards/oauth-state; no Postgres/Drizzle mentions.

## Whole-tree check (final origin/main)
- `npm ci` exit 0; `npm test` exit 0 (node:test 77/77 pass, vitest 6/6 pass); `npm run check` exit 0; `npm run build` exit 0.

## Findings
### Critical
- none
### Important
- none
### Minor
- package.json: 5 high advisories remain in prod audit (see above); all need a tailwind 4 / breaking move or have no upstream fix. Track for a future major upgrade.
- script/build.ts was edited by 345727e (drizzle/pg allowlist names removed) though not in that PRD's Files list; PRD notes called it optional, change is harmless.
- server/index.ts / server/auth.ts changes in the plan also include earlier plans' work; only the Clerk client swap belongs to this plan.
