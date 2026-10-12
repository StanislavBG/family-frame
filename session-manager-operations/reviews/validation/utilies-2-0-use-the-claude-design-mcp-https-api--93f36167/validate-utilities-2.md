# Validation: Utilities 2.0 plan (PRDs 224-232)

Base: a671a060240717fc08ea024138a229e33d3e754b. Commits `a671a06..HEAD`: cebc4d1 (224), cc01a8d (225), 425555f (226), d05bd03 (227), 6e541dc (228), f27d11b (229), 9a50e1d (230), 76fb29a (231), a8c90a3 (232).
Gates re-run in the worktree (node_modules symlinked from the main checkout for the run, removed afterwards):
- `npx vitest run client/src/lib/bills.test.ts client/src/lib/bills-chart.test.ts` -> 2 files, 47 tests passed.
- `npm run check` (tsc) -> exit 0.
- `npm test` -> exit 0 (server node:test 386/386 pass; vitest run before it passed).
Extra checks: no font links or `@import url` added in the diff (clean); no runtime-built Tailwind class names in `client/src/components/bills/` (template literals only interpolate module-level literal constants `BILL_*`, `SERIF`, `MONO`, `LINE`); no hard-coded vendor or series ids in the client; `useHouseholdProfile` is used only in `client/src/pages/utilities.tsx:185` (other use is the Settings page, pre-existing) and only `address.line1` is rendered in the header (`utilities.tsx:200,161`).

## 224 bills-model - VERIFIED
- Exports all present: `client/src/lib/bills.ts` (Bill, BillTone, toBill :64, dueInText :118, payLabel :128, groupBills :134, dueBills :154, paidBills :158, todoBills :162, nextUpBills :169, attentionCount :177, paidLabel :181, checkSummary :188, money :212, shortMoney :221).
- Tone order paid / check / action / check / soon / ok from latest point only: `bills.ts:79-97`.
- dueInText strings and 28+ day weeks: `bills.ts:118-125`.
- Group order Utilities, Internet, Home, then alphabetical; fallback `Bills` (`:77`); empty groups impossible by construction: `:134-150`.
- checkSummary branches (warn/alert -> "need a look", null with no checkedAt): `:188-210`.
- `bills.test.ts` passes (zero-point series, tone rules, etc.).

## 225 bills-chart-model - VERIFIED
- Exports present in `client/src/lib/bills-chart.ts`; setAside excluded in stackMonths :40, averageMonth :72, breakdown :84; setAsideNote uses only setAside inputs, null when none :94-105.
- monthWindow via shiftMonth crosses year boundaries :17-27; niceAxis steps/max :107-110; breakdown pct guard against NaN :90.
- `bills-chart.test.ts` passes.

## 226 bills-doc - VERIFIED
- `docs/time-series.md` diff is append-only (+48, no removed lines); new section `## Household bills layout (Utilities app)` with field table, status rules, health footer and a PUT example (property tax, `setAside: true`).
- `cmp docs/design/household-bills-v2.dc.html /home/bilko/Projects/family-frame-design-refs/household-bills-v2.dc.html` -> identical.
- `CLAUDE.md` gains the bills.ts / bills-chart.ts / components/bills / design-source bullet and the "never hard-coded vendors" rule.

## 227 utilities-photo-setting - VERIFIED
- `shared/schema.ts` adds `utilitiesPhotoMediaId: z.string().min(1).max(200).optional()` to `userSettingsSchema`.
- `UtilitiesPanel` registered in `app-settings-panels.tsx` (+92 lines); `npm run check` and `npm test` green. (Panel internals reviewed from the diff stat only; no UI run.)

## 228 bills-charts-ui - VERIFIED
- `bills-ui.tsx`: BILL_TONES (5 keys, literal classes with dark pairs), BILL_PANEL/NAV_BG/RULE, Kicker.
- `bills-charts.tsx`: StackChart viewBox 600x390, niceAxis gridlines, role=button columns with aria-label `Oct 2025: $1,234`, Enter/Space toggle, 0.3 opacity when another is selected, dashed average line; BillLineChart viewBox 860x330, 5 gridlines, empty text `No bills in this period`, `avg $X` label.

## 229 bills-overview-ui - VERIFIED
- `bills-overview.tsx`: summary label/sub-line/breakdown rows, set-aside note, `Show average` vs hint, To do (dark action cards `PAY BY ...`, light check cards with Autopay unclear/Past due), empty message, Next up with `All due dates →`; buttons are `min-h-[44px]`+.

## 230 bills-due-ui - VERIFIED
- `bills-due.tsx`: rows from `dueBills`, badge via `BILL_TONES[tone].badge`, `<b>` dueIn in tone ink, dashed paid cards in 2-col grid hidden when empty, `Nothing is due — all bills are paid`; all buttons min 44px.

## 231 bills-service-ui - VERIFIED
- `bills-service.tsx`: header with optional name, payLabel pill (clay for action/check else leaf, dark pairs), six stats with `—` fallback and shortMoney >= 10000, `BillLineChart` fed by `monthValues(.., monthWindow(today, 13))` and `avg ?? 0`, note hidden when empty.

## 232 utilities-shell - VERIFIED
- `utilities.tsx`: `useSeriesList('utilities')` + `useQueries` on `timeSeriesKeys.points(id, {limit: 400})`, `toBill(s, points, today, i)` with `useToday()` (:182-195); routes `/`, `/due`, `/:seriesId` with the existing not-found fallback and Back button (:257-278); header and mono date + line1; nav photo via `mediaUrl`, badge, groups, footer from `checkSummary` with clay/leaf dot; skeletons, EmptyState, points errors fall back to `[]`; `lg:grid-cols-[256px_minmax(0,1fr)]` with `useFitScale`; `shared/apps.ts` features updated.

## Findings

### Critical
- none

### Important
- none

### Minor
- `client/src/pages/utilities.tsx:~126` the nav bill-amount `cn(...)` stacks redundant tone classes (`BILL_TONES.action.ink`, `BILL_TONES.check.ink`, then a literal clay class); works but is confusing.
- `client/src/pages/utilities.tsx:~217` skeleton shows only while the series list loads; per-bill points loading renders bills with zero points (tone `paid`, `—` amounts) until they arrive, causing a visible flicker of statuses.
- `client/src/components/bills/bills-charts.tsx:~75` focus ring uses `stroke-[#a83818]` without a `dark:` pair; `BillLineChart` x-scale divides by 13 for 13 points (last point sits one slot short of the right edge). Both cosmetic.
- `client/src/lib/bills.ts:~205` `checkSummary` counts all series ("All N bills") even if only some publish `health.checkedAt`.
- `client/src/pages/utilities.tsx:~196` `eslint-disable` for exhaustive-deps around the bills memo (deps are `list.data`, `pointsKey`, `today`; acceptable).
- PRD 227: UI behaviours (8 MB reject, upload, remove) were not exercised in a browser; verified by typecheck and diff only.
- Code/security self-review of the diff: no secrets, no new input paths beyond the existing authenticated media upload; series ids are `encodeURIComponent`-escaped in URLs; no `dangerouslySetInnerHTML`; the street address is rendered only as text in the owner's own header.
