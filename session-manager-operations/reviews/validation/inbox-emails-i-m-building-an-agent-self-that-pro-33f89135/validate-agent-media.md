# Validation: agent media plan (PRDs 95-104, 106-110)

Base: `2e0600941cede936e680392e079371b46b6265c1` (HEAD `208679b`). Commits listed from `git log 2e06009..HEAD`; the PRD files were found under `prds-archived/`.
The base predates the earlier agent-data plan, so the combined diff also carries its data routes and MCP data tools. Those are out of scope here.

## Gate (identical for 95-103 and 106-110)
`timeout 300 npm run check && timeout 600 npm test`: `tsc` exit 0; vitest 5 files / 40 tests passed; `tsx --test server/*.test.ts` 208 pass, 0 fail.
The job worktree had no `node_modules`, so I symlinked the main checkout's (gitignored) and removed the link afterwards. PRD 104 has gate `none`.

## Per-PRD evidence

### 95-media-store: VERIFIED
- Exports: `server/media-store.ts:11,15,28,35,72,139,239,264` (MEDIA_MIME_TYPES, MEDIA_LIMITS, MediaError, MediaDeps, sniffMediaType, createMediaStore, MediaStore, lazy default `mediaStore`).
- Sniffing by magic bytes, null otherwise: `:72-86`.
- Rejections: 415 sniff null / mismatch `:162-163`; 413 `:158`; 400 id/filename/tags/emailIds `:150-155`; 507 `:176-177`.
- Id and dedupe: `:166-171`, same sha returns created false, different bytes 409.
- get/list/delete: `:198-234`, newest first with `{items,total,usage}`; delete uses a multi-path null update, so quota is derived from meta and is freed.
- `server/media-store.test.ts` has 14 tests.

### 96-media-pat-scopes: VERIFIED
- `server/api-tokens.ts:12-13` appends media:read and media:write after the six existing scopes.
- `server/auth.ts:32-33` allows `/api/files` and `/api/files/*`. `:48` adds the scoped area. `:57` treats the exact path as in-area.
- `server/index.ts:51-54` mounts `/mcp` at 10mb before the 2mb parser, which now covers only `/api/mail` and `/api/data`.
- `server/auth.test.ts` has the files-area test, the media:write-vs-`/api/media/proxy` 403 test, and the exact-path test.

### 97-media-rest-routes: VERIFIED
- `registerMediaRoutes` is called in `server/routes.ts` after `registerDataRoutes`.
- POST: `server/media-routes.ts:76-94`, raw 8mb on that route only, 201/200.
- Other routes: list/meta/serve/delete at `:96-129`.
- Serve headers `:116-121`: nosniff, CSP `default-src 'none'; sandbox`, inline with an ASCII-sanitised filename, `private, max-age=31536000, immutable`.
- 401 and MediaError mapping: `:11-28`.
- Snapshot lists the five routes plus import. `/api/media/proxy` is unchanged.
- `server/media-routes.test.ts` covers upload, dedupe, serve headers, 401, 415 and 404.

### 98-mcp-media-tools: VERIFIED
- `server/mcp.ts` adds `media?: MediaStore` to the services type.
- Tools media_upload, media_list, media_get_meta and media_delete are registered with the right scopes (`MEDIA_READ`/`MEDIA_WRITE`).
- `decodeBase64` rejects invalid or empty input. `withUrl` adds `/api/files/<encoded id>`. media_list returns meta only.
- The upload description states the types, 7MB, and the REST-preferred note.
- `server/mcp.test.ts` has the data-only denial, read-allowed/delete-denied, and write-upload tests. The tool-list test reads 24 tools.

### 99-email-media-links: VERIFIED
- `shared/agent-data.ts`: `mediaIds` max 50 (`MAIL_LIMITS.mediaIdsMax`) on insert, `mediaId` on attachment, and required `mediaIds` on `emailMessageSchema`. The no-existence-check comments are there.
- `server/mail-service.ts:54-55` normalises missing mediaIds to `[]`.
- Tests: `agent-data-schema.test.ts:160-170` (including `a.b` and over 50) and `mail-service.test.ts`.

### 100-photo-source-agent-media-server: VERIFIED
- `shared/schema.ts` adds `AGENT_MEDIA` and the enum entry. The default stays pixabay.
- `server/apps/photos.ts` has `mediaToPhotoItems` with the required filter, sort and mapping. The `/api/photos` short-circuit runs right after `getOrCreateUser` and before the Google logic.
- The settings Select offers "Agent uploads" and the Google section is hidden for it (`app-settings-panels.tsx`).
- `server/photos-agent-media.test.ts` has 3 tests.

### 101-agent-access-media-scope: VERIFIED
- `agent-access-settings.tsx`: TokenScope, SCOPE_LABELS ('Read media', 'Upload/delete photos & files'), and a Media access Select with `aria-label` and `data-testid="select-scope-media"`. handleCreate adds the scopes per selection. Default and post-create reset are "none".

### 102-photo-source-agent-media-client: VERIFIED
- `photos.tsx`: the query is enabled for AGENT_MEDIA without the Google conditions. The EmptyState text is exact, and the same `GooglePhotoDisplay` slideshow is rendered.
- `screensaver.tsx` has the same enablement.
- Refresh: `photos.tsx:69` `isUrlExpired` returns false for `photo.cached`, so agent items never reach `/api/photos/:id/refresh`.

### 103-media-client-hooks: VERIFIED
- `api.ts` `queryKeys.media` is keyed from `/api/files`. `agent-data.ts` has `mediaUrl`, `buildMediaListUrl`, `useMediaList`, `useMediaMeta` (disabled for an empty id) and the exported `MediaMeta`.
- `agent-data.test.ts` has the cases.

### 104-media-docs: VERIFIED
- `docs/agent-access.md`: scope table (`:23-24`), tool table including the rehost tools (`:73-78`), Media section 9 with limits, id rule, 409, `hidden`, emailIds/mediaIds linking and the `--data-binary` curl. Section 10 Rehosting, section 11 Photo frame source.
- Checked against the code: id pattern `[A-Za-z0-9_-]{1,128}`, 7MB, 500MB/5000, 3 redirects, 3 failures, batch of 50 and `remaining` all match.
- `CLAUDE.md` has the Agent data subsection (four files, the two RTDB paths, the Storage-bucket note, the `/api/media/proxy` note) and the tree entries.

### 106-media-url-import: VERIFIED
- `server/media-import.ts`: `rehostIdForUrl` is 'u' plus 31 hex chars. `createMediaImporter` and the default `mediaImporter` are exported.
- Dedupe without fetch: `:228-229`.
- `isSafeImportUrl` at `:39` (https only, no userinfo, no port, no IP literal). `assertPublicHost` at `:131` resolves all addresses; `isPublicAddress` covers 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 and multicast. IPv6 ::1, fc00::/7, fe80::/10 and IPv4-mapped private addresses are blocked.
- Redirects: manual, max 3, guard re-run on each hop (`:148-188`). 20s timeout (`:149`). Body cap 413 (`:190-221`). Sniffed mime with 415 (`:232-233`). The filename default comes from the sanitised last URL path segment, else "image".
- `server/media-import.test.ts` has 11 tests.

### 107-mail-rehost: VERIFIED
- `server/mail-rehost.ts`: `createMailRehoster` and the default wiring. Candidate selection, limit (default 20, max 50), concurrency 3, tags `['email']` with emailIds, merged mediaIds, readAt/ingestedAt/updatedAt stripped before upsert, failure records `{host, error, attempts, lastAt}` at `mailbox/<uid>/rehostFailures/<id>`, skip after 3 attempts, and `remaining`.
- `server/mail-rehost.test.ts` has 7 tests.

### 108-files-import-route: VERIFIED
- `media-routes.ts:56-74`: the importer is an optional parameter, the zod body schema caps url at 2048, and the route is registered before `/:id`. It returns 201 or 200, 400 for a bad body and 401 without the user header.
- The snapshot adds only POST /api/files/import. Tests are in `media-routes.test.ts`.

### 109-mail-rehost-route: VERIFIED
- `server/mail-routes.ts`: `rehoster` is an optional parameter. The zod schema takes emailIds (max 50) and limit (1-50). The PAT-without-media:write check returns the exact 403 message. The route is registered before `/:id`.
- The snapshot adds POST /api/mail/messages/rehost. Tests cover success, 400 and the 403. The 401 branch comes from the shared `mailHandler`; I did not find a rehost-specific 401 test (Minor).

### 110-mcp-rehost-tools: VERIFIED
- `mcp.ts` services gain `importer?` and `rehoster?`. `media_import_url` requires media:write and returns `{meta+url, created}`. `mail_rehost_images` checks both scopes, naming the missing ones, and its description says to call it until remaining is 0.
- The tests for a successful import, a mail:write-only denial and a rehost batch exist.

## Cross-PRD checks
- **No HTML/SVG served:** only five magic-byte types are stored (the stored mime is the sniffed one). Serving sets nosniff, a sandbox CSP and the stored mime. Clean.
- **PAT scoping:** `/api/files` (exact) and `/api/files/*` are both scope-checked (`auth.ts:57`). `/api/media/proxy` is not in `isPatPathAllowed` and a test asserts 403. `/api/files/import` is a POST, so it needs media:write. Clean.
- **SSRF:** private, loopback and link-local ranges are rejected on every hop including redirects. See the Minor findings for gaps.
- **User scoping:** all media, mail and rehost handlers read only `x-clerk-user-id`; the store paths are `media/<userId>`. Clean.
- **Route inventory:** the snapshot matches and `route-inventory.test.ts` is in the passing run.

## Findings

### Critical
None.

### Important
None.

### Minor
1. `server/media-import.ts:54-63` `isPublicIPv4` omits some non-public ranges (192.0.0.0/24, 198.18.0.0/15, 192.0.2.0/24 and similar). `isPublicAddress` (`:93-111`) does not block the NAT64 prefix 64:ff9b::/96, which can embed a private v4 address on NAT64 networks. Low impact, since only the owner's token can trigger imports and the DNS-rebinding window is documented at `:9-10`.
2. `server/media-routes.ts:48-54` `importBodySchema` accepts any id, tags and emailIds strings; the store re-validates them, so this is not a bug. Invalid ids and tags surface as 400 from the store.
3. `server/mail-routes.test.ts` has no rehost-specific 401 test (see 109).
4. `docs/agent-access.md` section 11 suggests "by re-uploading under a new id" to hide an already-uploaded file; tags are immutable in the current API. This is accurate but clumsy.
5. The worktree lacked `node_modules`. Environment issue only.
