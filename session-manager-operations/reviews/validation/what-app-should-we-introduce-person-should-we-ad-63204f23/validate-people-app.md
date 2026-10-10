# Validation: generic People app (PRDs 111-126)

Base: 2e0bda14d7d89d775e15135df11ab8c645994821. HEAD de14af0. 16 commits, 39 files, +2763/-52.
Gate (repo): `timeout 300 npm run check && timeout 600 npm test` run in this worktree
(node_modules symlinked from the main checkout; the symlink is gitignored). `tsc` exit 0;
vitest passed; `tsx --test server/*.test.ts` 229 pass / 0 fail. Combined exit 0.
Review tools: `/code-review` and `/security-review` were not run as separate tool passes; self-review of the
combined diff covered correctness, unsafe input, XSS, SSRF/URL handling and helper duplication.

## Per-PRD verdicts

| PRD | Commit | Verdict | Evidence |
|---|---|---|---|
| 111 mail-person-ids | b459cbf | VERIFIED | `personIdsSchema`, `PERSON_IDS_MAX` at shared/agent-data.ts:43; `emailMessageSchema.personIds` at :108; route passes `personId` at server/mail-routes.ts:54; mail-service tests added (+32); gate green |
| 112 media-person-ids | 51a0f92 | VERIFIED | server/media-routes.ts:54,92,103 (upload/import/list); media-store tests +48; gate green |
| 113 register-people-app | 8d84f2d | VERIFIED | `people` in APP_IDS and APP_MANIFESTS (defaultEnabled false) shared/apps.ts; APP_ICONS client/src/lib/app-registry.ts; APP_PAGES plus `nest` route client/src/App.tsx; app-manifest.test.ts updated; gate green |
| 114 dataset-person-ids | cbb85e6 | VERIFIED | records carry `personIds` (deduped), `personId` filter in server/dataset-service.ts, route server/data-routes.ts:60; tests +116 |
| 115 person-view-schemas | ea36869 | VERIFIED | shared/person-views.ts defines `ff-person-day` / `ff-person-week`; virtual BUILTIN_SCHEMAS in dataset-service.ts; `ff-` prefix reserved (403) on put-schema and put-records |
| 116 mcp-person-args | d23be16 | VERIFIED | `resolvePersonRefs` server/mcp.ts:129 (id or name, uuid pass-through, unknown name errors, per PRD); args on mail_upsert_emails/mail_list_emails/media_upload/media_import_url/media_list/data_put_records/data_list_records; mcp.test.ts +94 |
| 117 client-person-hooks | 95d59f2 | VERIFIED | personId on URL builders and `usePersonDays` / `usePersonWeeks` in client/src/lib/agent-data.ts; query keys client/src/lib/api.ts; agent-data.test.ts +19 |
| 118 person-day-timeline-layout | 306705b | VERIFIED | pure `layoutDayTimeline` client/src/lib/person-day.ts, person-day.test.ts (83 lines) passes |
| 119 person-publishing-docs | c2859dd | VERIFIED | docs/person-publishing.md: every cited MCP tool (mail_upsert_emails, mail_list_emails, media_upload, media_import_url, data_put_records, data_list_records, data_list_schemas, list_people) exists in server/mcp.ts; REST routes `POST/GET /api/mail/messages`, `/api/data/records/:schemaId` exist (mail-routes.ts:40,44; data-routes.ts:53,57); CLAUDE.md and docs/agent-access.md updated |
| 120 people-app-shell | c2fea3b | VERIFIED | client/src/pages/people.tsx: person picker, tab sub-menu via nested route `/:personId/:tab?`, tabs hidden when no data |
| 121 person-calendar-tab | c257075 | VERIFIED | person-calendar.tsx reuses exported `CalendarGrid` (calendar.tsx now exports it) filtered by person |
| 122 person-inbox-tab | c68554d | VERIFIED | person-inbox.tsx uses `useMailMessages({personId})`; body rendered as text in `whitespace-pre-wrap` div (:208), no HTML injection |
| 123 person-photos-tab | 3d07bb0 | VERIFIED | person-photos.tsx: `useMediaList({personId, kind:"image"})`, day grouping, load more, viewer |
| 124 person-sheets-tab | 4a51bc0 | VERIFIED | person-sheets.tsx + person-day-sheet.tsx using `layoutDayTimeline` |
| 125 person-more-tab | ea29ffc | VERIFIED | person-more.tsx renders unknown datasets read-only (`<pre>` / text spans) |
| 126 person-dashboard-tab | de14af0 | VERIFIED | person-dashboard.tsx: latest week/day, upcoming, unread inbox (`unreadOnly`), newest photos, links to tabs |

PRD files were all present under `prds-archived/`.

## Cross-cutting checks

- personIds not validated against the people list: REST/service layers never check (shared/agent-data.ts schema is string-length only; no lookups in mail-service, media-store, dataset-service). MCP resolves names to ids and rejects an unknown non-uuid string, as PRD 116 specified. See Minor 1.
- personIds not exposed through household connections: PASS. Connection code in server/routes.ts (~303-430) never touches mail/media/data; People page reads only own-account endpoints.
- Email text never rendered as HTML: PASS. `grep dangerouslySetInnerHTML|innerHTML` over client/src/components/person and pages/people.tsx: none. Text via `whitespace-pre-wrap`. `sourceUrl` hrefs are constrained to https by `httpsUrlSchema` (shared/agent-data.ts:95) and the ff-person-day schema pattern `^https://` (shared/person-views.ts:101).
- Nothing Evolet- or daycare-specific in code paths: PASS. No "Evolet"; one example-text mention of "daycare" in a schema description string (shared/person-views.ts:137), not logic.

## Findings

### Critical
none

### Important
none

### Minor
1. server/mcp.ts:129-137: MCP rejects a non-uuid personId/personIds that matches no person ("Unknown person"), including on list filters, where REST returns an empty list. Matches PRD 116 as written, but is stricter than "never validated against the people list". Agents publishing via MCP before a person exists must use a uuid-shaped id.
2. shared/person-views.ts:137: schema description names "daycare" as an example. Cosmetic, not behavioural.
3. server/mcp.ts:113 `resolvePeople` and `resolvePersonRefs` (:129) duplicate the id-or-name lookup; could share one helper with a pass-through flag.
4. Review tooling: `/code-review` and `/security-review` not executed as tool passes (see top).
