# Validation: agent-data framework (PRDs 83-93)

Base: `0c66d91baf511a5b181828bf01bf65a8328767d6` (from the plan's implementation notes). Head: `2ad7ea2`. Combined diff: 27 files, +2412/-37, 11 feature commits.

Gate (re-run in the job worktree after `npm ci`; the worktree had no `node_modules`):
- `timeout 300 npm run check` → exit 0 (tsc clean)
- `timeout 600 npm test` → exit 0 (vitest + `tsx --test server/*.test.ts`: 154 node:test pass, 0 fail)

Note: PRD file `87-dataset-service.md` is still in `prds/` (not archived) though its commit landed (`bfd99d8`); housekeeping only.

## 83 agent-data-schemas — VERIFIED
Commit `3c6991b`.
- Patterns/limits: `shared/agent-data.ts:8-9` (patterns), `:11-38` (MAIL_LIMITS, DATA_LIMITS) match the PRD values exactly.
- Schemas and types: `insertEmailSchema` strict `:61`, `emailMessageSchema` `:82`, `emailSummarySchema` `:95`, `upsertEmailsSchema` `:97`, `markEmailsReadSchema` `:101`, data schemas `:108-146`, types `:153-159`.
- Rejects: `agentIdSchema` regex (`:42`) bars `. / $ # [ ] <`; `httpsUrlSchema` (`:44-48`) bars non-https; `text` max 200000 (`:71`); `.strict()` bars `html`.
- `insertDataRecordSchema` refine on `data !== undefined`, `data: z.unknown()` (`:127-135`).
- `server/agent-data-schema.test.ts`: 9 tests, pass.

## 84 agent-data-pat-scopes — VERIFIED
Commits `d4c8e0f`.
- `API_TOKEN_SCOPES` is the six scopes in order (`server/api-tokens.ts:5-12`); test in `api-tokens.test.ts` covers list and verify of new scopes.
- `PAT_SCOPED_AREAS` table and `patScopeAllows` (`server/auth.ts:38-64`); `isPatPathAllowed` adds `/api/mail/` and `/api/data/` (`:30-31`); the inline calendar check is replaced (`:110`). Calendar GET stays implicit, non-GET needs `calendar:write`.
- `/api/tokens` not in allowlist; asserted by new `auth.test.ts` test.
- New auth tests: calendar-only 403 on mail/data, mail:read, mail:write, data:write, `patScopeAllows` unit cases; all pass.
- `server/index.ts:44-56`: `jsonVerify` hoisted, 2mb parser on `["/api/mail","/api/data","/mcp"]` mounted before the unchanged global parser.

## 85 agent-access-scope-picker — VERIFIED
Commit `322c023`. `client/src/components/agent-access-settings.tsx`: `TokenScope` six values (`:36-42`); `SCOPE_LABELS` with the four specified labels (`:59-66`); Mailbox/App data `Select`s with `aria-label` and `data-testid` (`~:247-278`) plus helper text; `handleCreate` builds scopes per spec (`:131-140`); form state reset on success (`:111-112`); badges use `SCOPE_LABELS[s] ?? s` (`:182`). tsc passes. No UI test was required or added.

## 86 mail-service — VERIFIED
Commit `525c08f`. `server/mail-service.ts`: exports `MailError`, `MailDeps`, `createMailService`, `MailService`, `mailService` (lazy, `getFirebaseDb()` wired). `upsertEmails` (`:80-129`): zod 400 with path+message, duplicate-id 400, index/bodies split, ingestedAt/readAt preserved, snippet derived (200 chars, whitespace collapsed), single `deps.update` per batch, pruning oldest by receivedAt beyond 2000, returns `{created,updated,ids,pruned}`. `listEmails` filters, `q` over subject/from/snippet, limit clamp 1..200, `before` cursor, `nextBefore`. `getEmail`, `setRead`, `deleteEmail`, `unreadCount` present. Never touches `users/` (grep clean). 7 tests incl. user isolation, pass.

## 87 dataset-service — VERIFIED
Commit `bfd99d8`. `package.json` has `ajv ^8.20.0`, `ajv-formats ^3.0.1`; `npm ci` succeeded, so the lockfile is in sync. `server/dataset-service.ts`: `Ajv2020` strict, no `loadSchema` (remote `$ref` fails to compile → 400), fresh Ajv per compile; `putSchema` size cap, 20-schema cap (409), version increment, `jsonSchemaJson` string; `putRecords` 404 unknown schema, validates all before writing, message names index/id/instancePath, `recordBytesMax`, 5000 cap (409), `createdAt` preserved, `dataJson` string; list/get/delete as specified; no `users/` access. 10 tests including user isolation, pass.

## 88 mail-rest-routes — VERIFIED
Commit `a8a6304`. `server/mail-routes.ts` registers the six routes in the specified order (static `unread-count` and `messages/read` before `:id`); 401 without `x-clerk-user-id`, `MailError` → status, `asyncHandler` for 500; `registerMailRoutes` called in `server/routes.ts:74`. Snapshot has exactly the six mail routes. 6 route tests pass; `route-inventory.test.ts` passes.

## 89 mcp-mail-tools — VERIFIED
Commit `2e06009`. `buildFamilyFrameMcpServer(ctx, service, services)` (`server/mcp.ts:54-58`); `run(requiredScopes, fn)` (`:70-85`) with calendar message text preserved; five mail tools with correct scopes; descriptions state metadata-only attachments, batch 50, and untrusted text warning; `registerMcpRoutes` uses `[...API_TOKEN_SCOPES]` for session requests (`:369`). Tests: calendar-only denied, mail:read list OK / mark-read denied, mail:write upsert; pass.

## 90 data-rest-routes — VERIFIED
Commit `dc63e96`. `server/data-routes.ts` has the eight routes as specified; registered right after mail routes (`routes.ts:75`); 401 and `DatasetError` mapping. Snapshot adds exactly the eight data routes (14 new lines total with mail). 5 tests pass.

## 91 mcp-data-tools — VERIFIED
Commit `5aa4c7d`. Eight `data_*` tools (`server/mcp.ts` `data_put_schema` … `data_delete_record`) with read = `data:read|data:write`, write = `data:write`; `DatasetError` → isError; `data_put_schema` description covers 2020-12, no remote `$ref`, version auto-increment, no revalidation. Tool-list test expects 18 (`mcp.test.ts:121`); mail-only denied, data:read allowed/denied, data:write put schema then records; pass.

## 92 agent-data-client-hooks — VERIFIED
Commit `5d00799`. `client/src/lib/api.ts` `queryKeys.mail` / `queryKeys.data` start with REST path strings; `client/src/lib/agent-data.ts` has `buildMailListUrl`, `buildDataRecordsUrl` (URLSearchParams, undefined omitted, `unread=1`, `encodeURIComponent`) and all seven hooks with `enabled` guards on empty ids; `useMarkMailRead` invalidates `["/api/mail/messages"]` (covers list and detail) and unread-count. 5 vitest tests pass.

## 93 agent-data-docs — VERIFIED
Commit `2ad7ea2`. Cross-checked against code: scope table (4 new scopes, write implies read); every REST route, MCP tool name/scope and limit in `docs/agent-access.md` §4, §6, §7 matches `shared/agent-data.ts`, `server/mail-routes.ts`, `server/data-routes.ts`, `server/mcp.ts` (batch 50, text 200000, 2000 prune, ids 200, list limits 200/500, 100 records, 262144 bytes, 5000 records, 20 schemas, 65536 schema bytes); recipe with both curl examples (§8); roadmap line updated. `CLAUDE.md` has the "Agent data (mailbox + datasets)" subsection with the RTDB paths and the privacy rule, and the Project Structure tree lists the new files.

## Cross-PRD checks
- PAT default-deny: `patScopeAllows` finds the area by prefix; both `/api/mail/` and `/api/data/` need the read or write scope for GET and the write scope otherwise; paths outside the allowlist (including `/api/tokens/*` and case variants) get 403. Tested.
- User isolation: the only readers/writers of `mailbox/` and `appData/` are `mail-service.ts:34` and `dataset-service.ts:68-69`, always rooted at the caller's `userId` from `x-clerk-user-id` or MCP ctx. Neither service nor route references `users/`. Isolation tests exist for both services.
- JSON-string round-trip: `jsonSchemaJson` and `dataJson` are stored as strings and parsed back; test covers empty arrays, null, and `.`/`$` keys.
- Route-inventory snapshot: 14 new entries (6 mail + 8 data); `route-inventory.test.ts` passes.

## Findings
Reviewed manually (no `/code-review` or `/security-review` output was produced in this headless run, so this is a self-review).

### Critical
None.

### Important
1. Route/tool path params are interpolated into RTDB paths without the id-pattern check. `server/mail-service.ts` (`getEmail`/`deleteEmail`: `index/${id}`, `bodies/${id}`) and `server/dataset-service.ts` (`getRecord`/`deleteRecord`: `${recordsPath}/${recordId}`) take `:id`/`:recordId` straight from `req.params` (and `z.string().min(1)` in MCP). An encoded slash (e.g. `x%2FdataJson`) addresses a child node of the caller's own data; `DELETE` could remove a record's `dataJson` field, after which `toRecord` (`dataset-service.ts:46`) throws on `JSON.parse(undefined)` and `listRecords` returns 500 for the whole dataset. Characters illegal in RTDB keys give a 500 instead of 404/400. Not cross-user (the prefix is fixed), but cheap to close: validate against `AGENT_ID_PATTERN` and return 404/400.

### Minor
1. `server/index.ts:51-54`: the 2mb JSON parser runs before the session-header middleware, so unauthenticated clients can make the server parse up to 2mb on `/api/mail`, `/api/data` and `/mcp` (the global limit was 100kb).
2. `server/dataset-service.ts:76` validator cache `Map` is unbounded across users/versions (only dropped on the same user's schema put/delete); agent-supplied `pattern` regexes are compiled by Ajv with no ReDoS guard (own-account impact only).
3. `server/mail-service.ts:~140`: an unparseable `before` is silently ignored rather than rejected with 400.
4. `server/mcp.ts` `mail_mark_read` accepts any string ids while the REST route uses `AGENT_ID_PATTERN`; harmless because `setRead` only matches ids already in the index.
5. Housekeeping: `prds/87-dataset-service.md` not moved to `prds-archived/`.
