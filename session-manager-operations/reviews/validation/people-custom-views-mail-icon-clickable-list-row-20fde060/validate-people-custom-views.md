# Validation: People custom views (mail icon, row links, sort, More exclusion)

Base 6d8f881. Gates re-run: `npm run check` (tsc) clean; `npm test` server 541/541 pass; `npx vitest run` 281/281 pass. PRD files all found in prds-archived.

## view-mail-icon — VERIFIED
- shared/person-views.ts:145 `export const PERSON_VIEW_ICONS` includes "mail".
- client/src/lib/person-view-icons.ts: `Record<PersonViewIcon, LucideIcon>` with 15 names, `viewIcon` uses `Object.hasOwn` (constructor -> Sparkles).
- client/src/pages/people.tsx: uses `viewIcon(v.icon)`; local map and unused lucide imports removed.
- Tests: person-view-icons.test.ts, dataset-service.test.ts, mcp.test.ts added; suites pass.

## view-list-url-model — VERIFIED
- shared/person-views.ts: `urlField` in list block schema and type.
- client/src/lib/person-view.ts `httpsUrl`: only `https:`, no credentials, max 2048; returns `u.href`. Test person-view.test.ts:147 covers http, javascript:, data:, mailto:, relative, creds, oversize, non-strings.

## view-list-row-links — VERIFIED
- person-view-section.tsx: `<a href={item.url} target="_blank" rel="noopener noreferrer">`, visible `ExternalLink` icon, sr-only text, focus-visible ring; no hover-only cue. Rows without url stay plain `li`.

## dataset-list-sort — VERIFIED
- server/dataset-service.ts listRecords: validates sortField (pattern, <=100) and sortDir (400s, sortDir without sortField 400); sort applied before `slice(offset, offset+limit)`; missing values rank 3 and sort last in both directions; default desc.

## dataset-sort-params — VERIFIED
- data-routes.ts passes sortField/sortDir; mcp.ts `data_list_records` adds zod-validated params; client agent-data.ts `DataRecordsParams` + `buildDataRecordsUrl`; tests added and pass.

## view-list-sort — VERIFIED
- Schema has sortField/sortDir with `dependentRequired`; ListBlock passes sort to `useDataRecords`; `person_view_validate` also checks urlField/sortField against data.

## more-hides-view-datasets — VERIFIED
- person-view.ts `viewSourceSchemaIds`/`moreSchemas` (defensive, never throws); per-person since views are fetched with `personId`. person-more.tsx and people.tsx both use it. No More flash: `!viewRecords.isLoading` gate in people.tsx and `viewRecords.isLoading` in person-more.tsx skeleton.

## person-view-docs — VERIFIED
- docs/person-publishing.md, docs/agent-access.md, CLAUDE.md describe icons incl. mail, urlField (https only, new tab), sortField/sortDir, More exclusion, record sorting; all match the code read above.

## Findings
- Critical: none.
- Important: none.
- Minor: sort tie order falls back to the earlier default (updatedAt desc) only because Array.sort is stable; `server/dataset-service.ts` ~line 277. Relies on engine stability (guaranteed in ES2019+).
- Minor: moreSchemas also ignores views of schema ids the person's views read even when the dataset has other, unviewed records; this is the intended design per PRD.

Review focus: PAT allowlist (server/auth.ts) and route inventory untouched (not in diff stat); no new route; Tailwind classes are literal; the only new colour class is the theme token `ring-ring`, which is already dark-aware.
