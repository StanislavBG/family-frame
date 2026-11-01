# Validation: events fix wave

Base: 14900e941193855dfd80694e900da8b1ec5bfa96. PRD files found in `prds-archived/` (394-401).

## Global checks
- `git diff 14900e9..HEAD --stat -- shared/events.ts` printed nothing, so shared/events.ts is unchanged since the base.
- `npm run check` passed (tsc, no output). `npm run build` passed (dist/index.cjs built).
- `npm test` passed: vitest 34 files / 396 tests, node:test 553 pass / 0 fail.
- Combined diff: 26 files, +480/-80. Only the files listed in the PRDs were touched. I self-reviewed it, because the /code-review and /security-review runs were not made inside this validator run. I saw no secrets, path traversal or unsafe input handling. The class prompt uses no street address (covered by test).

## events-fit-scale-stable: VERIFIED
- fit-scale.ts:29-38 exports FitState, INITIAL_FIT and stepFitScale. use-fit-scale.ts:2,33 drives scale from a ref through stepFitScale.
- fit-scale.test.ts grew by 55 lines. The full suite is green.

## events-filter-bar-collapse: VERIFIED
- events-filter-bar.tsx:142 (xl:hidden row), :148 (events-filter-toggle), :155 (events-filter-summary), :162 (`contents` / `hidden xl:contents`), min-h-11 kept. The groups are rendered once.

## events-day-counts: VERIFIED
- events-day.ts:62 dayCounts and :75 formatDayCount. events-day-view.tsx:85 uses events-day-view-count. events-day-panel.tsx:157 uses events-day-count. "Nothing planned" at view :136 and panel :182. Tests added in all three test files.

## events-page-count-polish: VERIFIED
- events-filters.ts:191 exports isUpcoming. events.tsx:344-345 and :499-500 pass upcoming counts. :463 has min-h-full. events.test.ts +31 lines.

## events-hero-class-when: VERIFIED
- event-hero.tsx:268 uses recurrenceText with the "See the class website for times" fallback. event-actions.tsx:78 has the 1 h choice, :145 CLASS_NOTE, :147 exported VisitEditor, :351 and :468 pass the note. Tests were added.

## events-class-ages-years: VERIFIED
- events-activity.ts:63 agesInYears, used at :76 (suitsAge) and :101 (audienceGroup). normalize.ts:439 applies it. Both test files were extended.

## events-classes-search-yield: VERIFIED
- search.ts:86-87 export CLASSES_ADULTS_KEY and CLASSES_FAMILY_KEY. :94 maxTasks defaults to 17. :116-118 hasKids gates the family task. The old "Each candidate needs session dates" line is not in the file (grep found none). search.test.ts was rewritten and passes.

## events-fixes-docs: VERIFIED
- docs/events.md covers class searches, the 30-day range, the family skip, 17 tasks, the loose prompt, ages in months and day counts with the Filters button. CLAUDE.md:249 mentions stepFitScale. README.md has no classes-lessons or old task count (grep found none).

## Findings
- Critical: none.
- Important: none.
- Minor: none. Items I did not run: the browser check of the UI, and the exact prompt text of the search tasks beyond the tests.
