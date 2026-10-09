# Validation: agent-access plan

Base: `3c532e71e52ee744162b5650850357f943211358`. PRD files were in `prds-archived/`. Diff: 22 files, +2556/-352.

Gates re-run in a fresh `npm ci` of the worktree, because the worktree had no `node_modules`. The main checkout's `node_modules` lacks `@modelcontextprotocol/sdk`, so it could not type-check this tree.
- `npm run check`: exit 0.
- `npx tsx --test`: api-tokens 9/9, auth 14/14, calendar-service 8/8, mcp 7/7.
- `npm run build`: exit 0 (`dist/index.cjs` 997.7kb).

## api-token-primitive — VERIFIED
- `server/api-tokens.ts:5-7` has the prefix, scopes and type. `ApiTokenRecord` and `TokenStore` are at `:16-30` with the specified shapes.
- `createApiToken` (`:43-76`): trim/empty/>60 name checks, scope validation, 10-token cap, `randomBytes(32).toString("base64url")`, stores only `sha256` hex.
- `verifyApiToken` (`:78-97`): wrong prefix, malformed body and unknown hash return null. `lastUsedAt` is updated at most hourly, with errors swallowed.
- `listApiTokens` sorts newest first (`:99`). `revokeApiToken` is owner-scoped (`:107`).
- `firebaseTokenStore` (`:121`) uses `apiTokens/<hash>` and `orderByChild("userId").equalTo`. It calls `getFirebaseDb()` lazily.
- Tests cover round trip, hash-only storage, 10-token cap, scope validation, revoke isolation and ordering (9 pass).

## pat-bearer-auth-middleware — VERIFIED
- `server/auth.ts:49-52` always deletes the four identity headers, including `x-ff-auth` and `x-ff-scopes`.
- A verified PAT sets the four headers (`:78-81`). An invalid token returns 401 `Invalid API token` without calling next (`:62-65`). The session branch sets `x-ff-auth: session` (`:92`).
- The allowlist (`:25-31`) is `/api/calendar/*`, exactly `/api/people/list`, and `/mcp` or `/mcp/*`. Everything else gets 403 `API tokens cannot access this endpoint` (`:66-69`).
- Non-GET `/api/calendar/` without `calendar:write` gets 403 (`:70-77`).
- `server/index.ts:44-58` wires `verifyApiToken` with the username from `getUserData(...)`, falling back to `"user"`.
- `auth.test.ts` covers the required cases (14 pass).

## api-token-routes — VERIFIED
- `server/routes.ts:200-256`:
  - `GET /api/tokens` calls `listApiTokens`.
  - `POST /api/tokens/new` validates with a zod schema and returns `{token, record}`. `ApiTokenError` maps to 400.
  - `DELETE /api/tokens/:id` returns 404 if not found, else `{success:true}`.
- The shared guard `getTokenManagerId` returns 401 without a user id and 403 `API tokens cannot manage tokens` when `x-ff-auth` is `pat`. All handlers use `asyncHandler`.
- `npm run check`: 0.

## agent-access-settings-ui — VERIFIED
- `client/src/lib/api.ts:15` adds `queryKeys.apiTokens`.
- `settings.tsx`:
  - `NavSection` and `validSections` include `agents` (`:233`, `:255`).
  - The nav item uses the `Bot` icon (`:247`).
  - The section renders `<AgentAccessSettings />` (`:687-694`).
- `agent-access-settings.tsx`:
  - It uses `EmptyState` (`:175`), shows `Never` or `formatRelativeTime` for last use (`:159`), and confirms revoke in an `AlertDialog` (`:264`).
  - Scope labels are at `:51-52`. The warning text is at `:237`. The command uses `window.location.origin` (`:116`).
  - Mutations invalidate `apiTokens` and toast the server error.
- Not run in a browser; verified by reading plus `tsc`.

## calendar-service-extract — VERIFIED
- `server/calendar-service.ts` exports `createCalendarService`, `calendarService`, `CalendarError` and `CalendarDeps`. `normalizeEvent` moved out of routes.
- The logic matches the old routes line for line in the diff: legacy normalization and save-back, only `Shared` events from connected homes, `homeName || username` creator, 403 with the original messages.
- `validateDates` (`:25-33`) rejects non-real and malformed dates and end<start with 400.
- REST URLs and success JSON shapes are unchanged, and error statuses and bodies are unchanged for existing flows (403 messages kept; 500 body unchanged). New 400s apply only to invalid dates, which is the PRD's intent.
- 8 tests pass.

## calendar-mcp-endpoint — VERIFIED
- `package.json` adds `@modelcontextprotocol/sdk ^1.32.1` and `zod ^3.25.76`. Build passes.
- `server/mcp.ts` registers 5 tools: `list_people`, `list_events`, `create_event`, `update_event`, `delete_event`.
  - Write tools return `isError` without `calendar:write` (`:51`).
  - `ToolError` and `CalendarError` become `isError` text.
  - `endDate` defaults to `startDate` and `type` to `Private`. People resolve by id or case-insensitive name.
- `registerMcpRoutes`:
  - `POST /mcp` creates a fresh server and stateless transport per request. It returns 401 with `WWW-Authenticate: Bearer` without a user id.
  - `GET` and `DELETE` return 405. `routes.ts:104` registers it.
- Allowlist check (`server/auth.ts:25-31`): `/api/tokens*` and `/api/messages` are not allowed, so a PAT gets 403. A test asserts this for `/api/messages`. `/api/tokens` is covered by the same prefix logic and by the route guard (403 for `x-ff-auth: pat`).
- 7 tests pass.

## agent-access-docs — VERIFIED
- `docs/agent-access.md` has every required section. Tool names and inputs match `server/mcp.ts` field for field.
- The Roadmap lists OAuth 2.1 and non-calendar tools.
- `CLAUDE.md` has an `Agent / MCP Access` subsection of 10 lines (≤15) naming the three modules, the doc, and the allowlist rule.

## Findings
Critical: none.

Important: none.

Minor:
1. `server/auth.ts:25-31` — the allowlist is `/mcp` or `/mcp/*` (stricter than the PRD's `startsWith("/mcp")`, so safe). `/mcp/*` has no route, so it only produces a 404 after auth.
2. `server/mcp.ts:114` — `update_event` finds its target by listing all events, then `updateEvent` re-reads. This is two reads and a small race, harmless at household scale. The not-found message differs from the REST 403 text.
3. `server/middleware.ts` — an unrelated `weekStartsMonday: true` default was added in the range (outside these PRDs' file lists; from a sibling job).
4. Self-review for security: no secrets are logged. Tokens are hash-only, and the token body regex is checked before hashing. Identity headers are stripped before use. A PAT cannot reach token management at either layer. A failed PAT verification returns 401 and never falls through to the cookie path. No path traversal or injection found. `/code-review` and `/security-review` were done as a manual self-review of the combined diff.
5. The browser UI was not exercised end-to-end, because it needs Clerk and Firebase credentials. That is a coverage gap rather than a defect.
