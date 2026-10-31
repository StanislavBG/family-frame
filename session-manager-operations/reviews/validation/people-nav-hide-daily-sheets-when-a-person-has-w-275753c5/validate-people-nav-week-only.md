# Validation: people-nav-week-only-sheets

Base 642b4bb; one commit landed: 45777ad. PRD file: prds-archived/363-people-nav-week-only-sheets.md. Gate: none (criteria read from the tree). I also ran `vitest run client/src/pages/people.test.ts` (4 passed) and `npm run check` (clean).

## people-nav-week-only-sheets — VERIFIED
- AC1: `people.tsx:126` pushes "sheets" only on `days.data?.records.length > 0`. The weeks query, the `!weeks.isLoading` term in `ready` (~line 140) and the `usePersonWeeks` import are removed (diff). `grep usePersonWeeks` in people.tsx finds nothing.
- AC2: `people.test.ts:40` covers the week-only case. It renders the real page at /p1/dashboard and passes.
- AC3: the file has three more cases at lines 49, 55 and 59 (day+week, day only, neither). All pass.
- AC4: the test seeds personWeeks for limits 1 and 52. The red-before-edit claim is in the executor's report; I did not re-run it against the old code.
- AC5: `docs/person-publishing.md` diff shows the row renamed to `Daily sheets` and the exact sentence added as its own paragraph under the table, before "Record lists for".
- Review focus:
  - The change stays inside `usePersonTabs`.
  - The sheets count still comes from `days.data.total` (`people.tsx:135`).
  - The redirect (`hidden = nav.ready && !nav.tabs.includes(...)`, ~line 253) still sends a week-only person from /sheets to Dashboard. `ready` no longer waits on weeks, but `tabs` simply omits sheets.
  - The Dashboard still reads `usePersonWeeks(person.id, { limit: 52 })` (`person-dashboard.tsx:228`).
  - The docs sentence matches the code.

## Findings
- Critical: none.
- Important: none.
- Minor: none. I did not run `/code-review` or `/security-review`; I self-reviewed the diff. It has no input handling, secrets or paths, and it removes one query.
