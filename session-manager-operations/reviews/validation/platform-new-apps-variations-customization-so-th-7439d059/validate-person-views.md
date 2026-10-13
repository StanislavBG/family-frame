# Validation: person-views plan

Base: 5266aa8 (HEAD fea0910). Commits: 8543bb9 (schema), 48ce2ee (models), 9ecc534 (section), 4a65816 (nav), fea0910 (validate tool). PRD files found in `prds-archived/` (247-251).

Gate note: the job worktree had no `node_modules`, so I symlinked the main checkout's (git-ignored, not committed) to run the gates.

Gate results (all re-run in foreground, all exit 0):
- `npx tsx --test server/dataset-service.test.ts server/person-views.test.ts`: 22 pass / 0 fail
- `npx vitest run client/src/lib/person-view.test.ts`: 14 pass
- `npx tsx --test server/mcp.test.ts`: 31 pass / 0 fail
- `npm run check`: clean
- `npm test`: vitest 202 pass, node:test 411 pass / 0 fail

## person-view-schema: VERIFIED
- Exports PERSON_VIEW_SCHEMA_ID, FIELD_PATH_PATTERN, PERSON_VIEW_BLOCK_TYPES, PERSON_VIEW_JSON_SCHEMA, PERSON_VIEW_TITLE/DESCRIPTION, PersonView/PersonViewBlock: shared/person-views.ts:6,143-290. Schema matches the spec (title 1-40, order 0-99, blocks 1-12, oneOf by type const, additionalProperties false, REF_ID and FIELD_PATH patterns).
- `getFieldPath` never throws; undefined for empty path, null, array or non-object intermediates: shared/person-views.ts (end of added block).
- BUILTIN_SCHEMAS registers it via `builtin()`: server/dataset-service.ts:95.
- dataset-service tests (listed; one of each type accepted; unknown type, spaced path and 13 blocks rejected): server/dataset-service.test.ts:328-350. getFieldPath tests in server/person-views.test.ts. Gate green.

## person-view-models: VERIFIED
- parseViewRecord, viewTabId (`v-${id}`), sortViews (order default 50, then title), buildMetricsModel (TILE_CYCLE default tones, toLocaleString, unit appended), buildListModel (limit default 10, skips empty title), buildChartPoints (finite y, string x, ascending, limit default 90): client/src/lib/person-view.ts:15-98.
- 14 vitest tests cover each export including empty, missing, non-numeric y and the limit caps. Gate green.

## person-view-section: VERIFIED
- `PersonViewSection({person, view})` renders a serif h1 and one card per block, in order: person-view-section.tsx:225-262.
- Hook usage matches the spec: metrics `limit: 1` (:47); list `limit ?? 10` (:77); chart dataset via `buildChartPoints`, series via `useSeriesPoints`, `SeriesLineChart` (:111-158); photos use `useMediaList({personId, kind:"image", tag, limit})` with `mediaUrl` (:171-190); text splits on blank lines and renders plain `<p>` (:197-210).
- Empty block returns null, loading shows a Skeleton, and a parent EmptyState appears when every data block reports empty and there is no text block (:232-259).
- Colours come from SATCHEL_TONES / shared tokens; no runtime-built class names, no hover-only info. `npm run check` clean.

## people-nav-views: VERIFIED
- `useDataRecords(PERSON_VIEW_SCHEMA_ID, {personId, limit: 20})`, and `!viewRecords.isLoading` counts toward `ready`: client/src/pages/people.tsx:122,170.
- Valid views are parsed, sorted, placed between the static tabs and "more", with icon mapped via VIEW_ICONS (fallback Sparkles) and tone (fallback stone): people.tsx:139-148,258-275.
- `v-<id>` renders `<PersonViewSection key={person.id + activeView.id}>`; an unknown `v-` id gives `hidden` once `ready`, so it redirects to dashboard with replace: people.tsx:283,400-404.
- `RESERVED_SCHEMA_PREFIX` replaces the hardcoded "ff-": people.tsx:125. Static TABS filtering is unchanged. `npm run check` and `npm test` pass.

## person-view-validate-tool: VERIFIED
- `person_view_validate` is registered with `{view, person}` under DATA_READ via `run()`; `resolvePeople` runs first: server/mcp.ts:167-181.
- Ajv 2020 is compiled once at module level with the same options as the dataset service (the dataset service doesn't export its compile path, which the PRD allows): mcp.ts:61-68. Failure returns `{valid:false, errors:[{path,message}]}`.
- Success returns per-block `{index,type,records,missingFields}`. Series sources use `getSeries().pointCount` and a 404 gives 0. Photos and text give `records: null`. Missing fields use `getFieldPath` on the newest record: mcp.ts:182-212.
- Tests at server/mcp.test.ts:694-728 cover invalid view errors, missingFields, unknown person, and refusal without data:read.
- docs/person-publishing.md §8 "Custom views (ff-person-view)" has purpose, one JSON example per block type, personIds, `data_put_records`, and validate-first guidance.

## Findings

Critical: none.
Important: none.

Minor:
1. server/mcp.ts:61-68 duplicates the Ajv construction from server/dataset-service.ts instead of reusing it. This is permitted by the PRD but risks drift if the dataset service's options change.
2. server/mcp.ts:204 reports `records: total` (all records for the person), while the PRD's wording ("lists up to 1 record") is ambiguous. The count is more useful than 0/1, so no action is needed.
3. server/mcp.ts:204: a dataset block whose `schemaId` doesn't exist will make `listRecords` throw. That surfaces as a tool error rather than `records: 0`, which is acceptable but less friendly than the series path.
4. client/src/components/person/person-view-section.tsx:232: the all-empty EmptyState only shows if every non-text block reports "empty". A view with a text block never shows it, as the PRD specifies.
5. Security self-review (the /code-review and /security-review skills were not run, so I reviewed the diff by hand): no secrets, no path handling, and the text block renders as plain React text with no HTML injection. Schema ids and field paths are pattern-constrained, and `getFieldPath` uses own-property checks, so there is no prototype access.
