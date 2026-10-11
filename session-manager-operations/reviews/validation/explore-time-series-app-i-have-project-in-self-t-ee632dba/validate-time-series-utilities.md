# Validation: time-series store, token scope editing, Utilities app

Base: `b4b5c97c506288e7685cf815ff0961aba20833cd` (from the PRD notes). HEAD `1794a9d`. 14 commits, 31 files, +2874/-170.
PRD files were all found under `prds-archived/` (209-222), so there are no missing-file findings.

## Gate results (re-run in the foreground in the job worktree)

All 14 PRDs share one gate. The worktree had no `node_modules`, so I symlinked the main checkout's (gitignored, not committed).

- `timeout 300 npm run check`: exit 0 (tsc clean)
- `timeout 600 npm test`: exit 0 (node:test 386 pass, 0 fail; vitest part green)
- `timeout 600 npm run build`: exit 0 (client and server built; this is the ts-utilities-app gate)
- ts-docs gate is `none`; checked by reading.

I did not run `/code-review` or `/security-review` as separate skills. They operate on pending changes, and this plan is already committed. I reviewed the combined diff myself for correctness, input handling, secrets, path traversal and helper duplication.

## Per PRD

### ts-shared-schema: VERIFIED
- `shared/time-series.ts:7-8` patterns match the PRD; `:10-24` `TS_LIMITS` has exactly the 13 keys and values.
- `:57-74` `putSeriesSchema` is strict, with trimmed, lowercased and deduped tags (`:41-45,62-66`), a `#rrggbb` color (`:68-71`) and byte-capped plain-object annotations (`:47-55`, TextEncoder).
- `:76-87` `timePointSchema` and `putPointsSchema` (1..500). `:26-39` date round-trip rejects 2026-02-30. `:89-97` `pointKey` and `pointTimeMs`. `:99-125` all five types.
- `server/time-series-schema.test.ts` (125 lines) exists and passes.

### pat-metrics-scopes-and-update: VERIFIED
- `server/api-tokens.ts` diff: the scopes are appended last, in order. `validateScopes` is extracted and shared by create and update.
- `updateApiTokenScopes` finds the token by id and userId, calls `store.set(match.hash, {...rec, scopes: dedupe})` (same hash, only scopes change), and returns null for another user's id.
- Tests are in `server/api-tokens.test.ts` (+26 lines) and pass.

### pat-auth-metrics-area: VERIFIED
- `server/auth.ts:47` allowlists `/api/metrics/`; `:65` adds the PAT_SCOPED_AREAS entry with the exact scope strings.
- `server/auth.test.ts:219` covers the metrics:read GET and the 403 on PUT; the PRD's no-metrics-scope 403 is in the same diff (+23 lines).

### ts-service: VERIFIED
- `server/time-series-service.ts:70-226` has all 8 methods, `TimeSeriesError` (`:15`), the `TimeSeriesService` type (`:228`) and the lazy Firebase singleton (`:252`).
- Errors: invalid id gives 400 (`:76-80`); Zod failure gives 400 (`:139,180`); missing series gives 404 (`:91`, used by get/delete/putPoints/listPoints/deletePoint); the 201st series gives 409 (`:146`); more than 5000 points gives 400 before any write (`:192-195`, the `update` call is after).
- putSeries preserves createdAt and stats (`:160-165`). putPoints upserts by `pointKey` (`:188`) and recomputes stats from all stored points (`:198-199`); deletePoint does the same (`:223`).
- listPoints keeps the newest when capped (`:214`) and clamps the limit (`:207-208`). listSeries and listTags sort as specified.
- Tests: `server/time-series-service.test.ts` (235 lines), including user isolation.

### pat-token-scope-route: VERIFIED
- `server/routes.ts` (registerTokenRoutes) registers PATCH `/api/tokens/:id` after POST `/new` and before DELETE. It uses `getTokenManagerId`: no user gives 401, `x-ff-auth: pat` gives 403 "API tokens cannot manage tokens".
- Bad body gives 400 `{error: "Invalid token data", details}`; ApiTokenError gives 400; unknown or foreign id gives 404 "Token not found"; success returns the record, which has no secret or hash.
- Defense in depth: `/api/tokens` is not on the PAT allowlist (`server/auth.ts:42-52`; `auth.test.ts:242`), so a PAT is refused at the middleware before the route.
- Snapshot diff adds only `PATCH /api/tokens/:id` for this PRD.
- `server/token-routes.test.ts` covers 401, PAT 403, 400, 404 and 200.
- The extraction into `registerTokenRoutes(app, store)` is the option the PRD allowed. Route order is unchanged.

### ts-metrics-routes: VERIFIED
- `server/metrics-routes.ts:36-72` has the 8 routes in the specified order, with 204 on both deletes.
- `metricsHandler` (`:8-25`) reads the user only from `x-clerk-user-id` (401) and maps `TimeSeriesError` to its status.
- `server/routes.ts` calls `registerMetricsRoutes(app)` right after `registerDataRoutes(app)`.
- Snapshot diff: exactly the 8 metrics entries plus the one PATCH entry, no other change (checked with `git diff`).
- `server/metrics-routes.test.ts` (170 lines) passes.

### ts-mcp-tools: VERIFIED
- `server/mcp.ts` registers all 7 tools. Reads use `TS_READ` (metrics:read or write); writes and deletes use `TS_WRITE`.
- `timeSeries` is an optional services override with a default. `TimeSeriesError` is in the `run` instanceof list.
- The `metrics_put_series` description covers lowercase slug tags, the "utilities" tag, free-form annotations and upsert by t.
- `server/mcp.test.ts` has +95 lines covering the data:read denial, the write round trip and the tag filter.

### pat-token-edit-ui: VERIFIED
- `client/src/lib/token-scopes.ts:182-233` has the types, `scopesFromAccess` (calendar:read always included, write implies read) and `accessFromScopes`. `token-scopes.test.ts` covers the round trips.
- `agent-access-settings.tsx`: a shared `AccessControls` component (`:102`) is used by both the create form (`:315`) and the edit dialog (`:340`). Label `htmlFor` and `aria-label` are set, with testids `select-scope-metrics` (via `select-scope-${key}`) and `button-edit-token-<id>` (`:266`).
- The PATCH mutation (`:180`) invalidates the token list and toasts, and the dialog text says the secret does not change (`:336`).

### ts-client-lib: VERIFIED
- `client/src/lib/time-series.ts`: `timeSeriesKeys` all start with "/api/metrics" (`:13-19`). The hooks are `useSeriesList`, `useSeriesPoints` (disabled for a null or empty id, `:50`) and `useSeriesTags`.
- `seriesStats` (`:81`), `monthlyBuckets` (`:123`, YYYY-MM from `t.slice(0,7)`), `sparklinePath` (`:144`, skips nulls, "" under 2 values, flat series centred), `formatSeriesValue` (`:161`) and `dueStatus` (`:177`, caller passes `today`, no `new Date()`).
- `time-series.test.ts` (143 lines) passes.

### ts-chart-components: VERIFIED
- `series-chart.tsx` is the only file in that PRD.
- `Sparkline` (`:23`) is a responsive `svg viewBox` with `preserveAspectRatio="none"`, `vectorEffect`, `role="img"` and an aria-label.
- `SeriesLineChart` (`:65`): "No data yet" for 0 points (`:68-83`); a single marker for 1 point; line, circle per point, dashed average line with a text label via `formatSeriesValue` (`:118-131`); first, middle and last x labels (`:103,141`); default `hsl(var(--primary))`; `fill-muted-foreground` classes; no fetching.

### ts-series-board: VERIFIED
- `series-board.tsx`: skeleton (`:167`), error with `role="alert"` (`:180`), EmptyState text naming the tag and `metrics_put_series` (`:188-196`).
- Tile is a `<button>` with `tile-series-<id>`, swatch, title, large latest value, date, 12-month Sparkline, avg and min–max, and Due plus an overdue/soon Badge from `dueStatus(dueDate, useToday())` (`:75-122`).
- One `useQueries` call shares keys with `useSeriesPoints` (`:33-42,153`), with `limit: 400`. Secondary-tag chips show, and the filter row appears at 2 or more secondary tags (`:215`).
- The totals strip is per unit with "Last 12 months" and the series count (`:202-213`). Dark pairs are on the badges.

### ts-series-detail: VERIFIED
- `series-detail.tsx`: Back button `button-series-back`, serif title, unit and tag badges, `whitespace-pre-line` description and summary, `formatRelativeTime(updatedAt)` (`:359-377`).
- Points are fetched with limit 5000; the chart plus 7 stats (Latest, Change %, Average, Median, Min, Max, Last 12 months) are formatted with `formatSeriesValue` (`:387-398`).
- Details section is omitted when empty; objects go in a `<pre max-h overflow-auto>` (`:400-418`). `annotationEntries` is an exported helper (`:272`).
- Points table is newest first with Date/Value/Label/Notes; notes show 4 inline entries plus a click disclosure; 50 rows plus a "Show all" button (`:284-326,446`).

### ts-utilities-app: VERIFIED
- `shared/apps.ts`: "utilities" follows "stocks" in `APP_IDS` and in `APP_MANIFESTS`, with `nested: true`, `defaultEnabled: false` and plain-language copy.
- `APP_ICONS.utilities = Receipt`; `GuardedUtilities = guarded(UtilitiesPage)` at module scope in `App.tsx`, wired into `APP_PAGES`.
- `pages/utilities.tsx`: `/` renders SeriesBoard with tag "utilities"; `/:seriesId` renders SeriesDetail with `onBack`, or a not-found message and Back button.
- `app-manifest.test.ts` expects 19 apps. `server/app-visibility.test.ts` and `server/default-user.test.ts` did not need edits (the suite is green).
- check, test and build all exit 0 (above).

### ts-docs: VERIFIED
- `docs/time-series.md` fields and limits match `TS_LIMITS` one for one. The 8 routes match `metrics-routes.ts` for method, path, query and status codes. The 7 MCP tools match `mcp.ts` for scope and inputs. Upsert-by-t and the privacy statement are present.
- It has "Tags drive displays" and "Utilities conventions" sections. The curl example's fields (title, description, summary, tags, unit, annotations; point t/value/label/annotations) are all valid for the strict schemas.
- `docs/agent-access.md` has both scope rows, the "Change an existing token's access" section (Edit access, same secret, next request, browser session only) and an updated allowlist note.
- `CLAUDE.md` has the new subsection and the "Utilities" feature bullet.

## Cross-cutting checks

- **Series data not in household connection payloads: pass.** `grep` finds `timeSeries` only in `server/time-series-service.ts` and `server/mcp.ts`. There are no references in `server/household*.ts`, `server/apps/*` or the connections code.
- **RTDB paths from input are validated: pass.**
  - `seriesId` goes through `SERIES_ID_PATTERN` (`checkSeriesId`) before any path is built. That covers loadSeries for get/delete/putPoints/listPoints/deletePoint, and the putSeries entry check (`:77,137`).
  - Point keys come from `t`, which is validated by `timePointSchema` (digits, `-`, `:`, `T`, `Z`, `+`, `.` only), then `pointKey` replaces `.` with `_`. This holds for deletePoint via `checkTime` (`:82-86,219`) and for puts via the schema.
  - `userId` only ever comes from the method argument (the auth header), never from the body.
- **A PAT cannot reach /api/tokens/\*: pass.** The middleware allowlist excludes it, and the routes also reject `x-ff-auth: pat` (403). A test covers each layer.
- **Secrets:** none added. The token record returned by PATCH has no hash or secret.

## Findings

### Critical
- None.

### Important
- None.

### Minor
1. `client/src/lib/token-scopes.ts:208`: `scopesFromAccess` always adds `calendar:read`. Editing an existing token that lacked calendar:read through the edit dialog silently grants it. This matches the create behaviour and the docs say it is always kept. It is still a quiet scope widening on edit.
2. `server/time-series-service.ts:101-113,142-167`: stats (`pointCount/firstT/lastT/latest`) are recomputed with a read-then-write. A `putSeries` that overlaps a `putPoints` can write back stale stats until the next point write. The series-cap check is also read-then-write (the code comment already accepts it). It is low risk for a single publisher per account.
3. `docs/time-series.md:38` and `server/mcp.ts` (metrics_add_points description) say writes are "all-or-nothing per call". The points write is one multi-path update, but the stats write after it is a separate call. A failure between the two would leave the points stored and the stats stale.
4. `client/src/components/time-series/series-chart.tsx:28`: the Sparkline aria-label prints raw min and max numbers with no unit or currency formatting.
5. `server/auth.test.ts`: there is no PAT test for `PATCH /api/tokens/:id`. Coverage comes from the method-agnostic allowlist test (`:242`, which uses GET and POST) and the route-level 403 in `token-routes.test.ts:55`.
6. `server/mcp.ts` (`metrics_get_series`): `limit` has no upper bound in the zod shape. The service clamps it to 5000, so this is cosmetic.

Process note: I created a `node_modules` symlink in the job worktree so the gate commands could run. It is gitignored and not committed.
