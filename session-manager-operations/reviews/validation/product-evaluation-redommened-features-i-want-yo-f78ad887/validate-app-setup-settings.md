# Validation: app setup settings plan

Base: 61fbcce (commits e8bdb61, d5f0ad2, f040e59, 48f27ac, 9919e3b, 25185dc). PRD files found in prds-archived/ (328-333).
Gate re-run (`timeout 300 npm run check && timeout 400 npm test`): tsc exit 0; node:test 497/497 pass; vitest 256/256 pass (21 files).
Absence check: `grep -rnE "app-details-panel|routeToAppId" client shared server CLAUDE.md` -> clean; app-details-panel.tsx deleted.

## app-setup-contract (328) — VERIFIED
- AppCategory/APP_CATEGORIES with exact titles/order: shared/apps.ts:28-36.
- AppNeed, APP_NEED_COPY (copy and hrefs match notes): shared/apps.ts:38-46. AppNeedFacts + appNeedStatus (null->todo, address->in-app): :48-66.
- category + needs set on all 20 manifests, mapping matches notes (diff checked entry by entry).
- Tests added in client/src/lib/app-manifest.test.ts (categories, copy, mapping for weather/people/messages/utilities/events, status done/todo/null); vitest green.
- defaultEnabled/order untouched in diff.

## settings-patch-hook (329) — VERIFIED
- settingsPatchInvalidations: client/src/lib/app-registry.ts:143-147; useSettingsPatch with "Failed to save" destructive toast: :149-161.
- appIdForPath (strips ?query, non-fixed, longest prefix, null for /, /settings, unknown): :163-173. Handles /calendar/day/2026-10-19 (test at app-registry.test.ts).
- AppSettingsSheet no longer has its own useMutation (app-settings.tsx diff).
- app-registry.test.ts covers all listed cases; green.

## app-page-component (330) — VERIFIED
- Exports AppPage and useAppNeedFacts: app-page.tsx:24,44.
- Order: header + badge (74-88) -> toggle `app-page-toggle-<id>` hidden when fixed (90-101) -> needs `app-page-needs-<id>` only if needs non-empty (105-141) -> settings `app-page-settings-<id>` (143-153) -> About (155-172) -> Open when enabled (174-178). Labels match.
- Need rows show label/howTo, tick or "Set up" Link; highlight border-amber-400 dark:border-amber-500 when justAdded and any todo (65, 107).
- Panel gets settings, useSettingsPatch update, setLocation; fallback text "Nothing to set up for this app." (146-150).
- useAppNeedFacts uses settings/people/connections.all/apiTokens keys, null until settings+people load, errors count 0 (24-37).
- Every colour has a dark: pair (lines 107, 118, 119); buttons min-h-11; nothing hover-only.

## settings-app-shelf (331) — VERIFIED
- app-picker.tsx: groups "On your screen" (with button-move-up/down-<id>), "Add more apps" by APP_CATEGORIES with icon/title/summary and `shelf-add-<id>`, "Always on" (110, 163, 209).
- AppPage in right column when lg (233-237), inline under row otherwise (76-81); initialAppId preselect + scroll kept (57-71).
- Empty texts present (112, 165). Default selection first enabled else first available (73).
- app-details-panel.tsx deleted, no imports. settings.tsx nav label "Apps"; heading "Apps" + required sentence (103-104).

## app-gear-sheet (332) — VERIFIED
- routeToAppId removed; sheet uses appIdForPath and `<AppPage variant="sheet">`, title = manifest title, footer "All settings for this app" -> /settings?section=apps&app=<id> (app-settings.tsx).
- app-controls.tsx: gear when appIdForPath(location) non-null and enabled (so nested calendar URLs and panel-less apps work).
- Remove-in-sheet: effect closes sheet and navigates to / when enabled flips false (app-settings.tsx:31-39).
- No remaining routeToAppId references.

## doc-app-setup-contract (333) — VERIFIED
- CLAUDE.md App Registry section lists category/needs, APP_CATEGORIES, APP_NEED_COPY, appNeedStatus; AppPage described as the one page rendered by app-picker and app-settings; new-need rule present (3 bullets, <=4).
- Project structure: app-details-panel gone, app-page.tsx named, app-picker line describes the shelf.

## Findings
No Critical or Important findings. /code-review and /security-review were not run as tools; self-review of the diff found no unsafe input handling, secrets, or path traversal (appIdForPath only does string matching; need hrefs are static constants).

Minor
- client/src/components/app-page.tsx:130 — "Set up" links inside the gear sheet navigate without closing the sheet (sheet stays open over the new page when the target is outside the app's route). Not required by the PRD.
- client/src/components/app-picker.tsx:125-150 — up/down arrow buttons remain h-6 w-6 (pre-existing, below the 44px target the new controls follow).
- client/src/components/app-picker.tsx:162 — on-screen rows show title only, no summary (PRD only requires summary for "Add more apps").
- app-page.tsx:49 — duplicate settings query alongside useAppNeedFacts; harmless (shared cache).
