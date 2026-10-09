# Validation: repair-birthday-display-off-by-one

Base: 4f690cca8e948907f588a359aa734ced5173fec2 (given). Commits touching client/src/pages/settings.tsx since base: `416daf9 fix(settings): birthday display off by one day`. Combined diff: 1 file, +2/-1.

## repair-birthday-display-off-by-one — VERIFIED

- AC1: client/src/pages/settings.tsx:57 imports `parseLocalDate` from "@/lib/format"; :198 renders `parseLocalDate(person.birthday).toLocaleDateString(undefined, { month: "long", day: "numeric" })` inside the unchanged `person.birthday &&` guard. `grep 'new Date(person.birthday)'` → clean.
- AC2: `TZ=America/Los_Angeles node` with parseLocalDate's body (format.ts:30-33) on '2020-01-23' → `January 23`. Old code path `new Date("2020-01-23")` → `January 22` (bug reproduced, fix confirmed).
- AC3: `timeout 300 npm run build` (after `npm ci` in the worktree) → exit 0, "✓ built", dist/index.cjs 990.2kb.
- AC4: commit message starts `fix(settings): birthday display off by one day`; `git branch -r --contains 416daf9` → origin/main; `git log origin/main` head is 416daf9 after fetch.
- Gate: build exit 0; `grep -q 'parseLocalDate(person.birthday)'` exit 0.

## Findings

Critical: none.
Important: none.
Minor:
- client/src/lib/format.ts:30 `parseLocalDate` does no validation of malformed strings (yields Invalid Date); same behavior as the existing calendar usage, out of scope.
- The `/code-review` and `/security-review` skills were not run; I self-reviewed the 3-line diff instead: no input-handling, secrets or path concerns, and it reuses the existing helper.
- Did not start the app (production Firebase untouched).
