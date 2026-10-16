# Validation: calendar-create-form-reset-on-cancel

Base: ea43782. Commit in range: 2c49da6 (only `client/src/pages/calendar.tsx`, +14/-4).

## 306-calendar-create-form-reset-on-cancel — VERIFIED

- AC1 (close resets): `calendar.tsx:593-596` `closeCreate()` = `form.reset(); setCreateEventOpen(false)`. Used by Dialog `onOpenChange` on close (`:642`), Cancel button (`:805`) and add-person-first button (`:659`).
- AC2 (month New Event fresh): `calendar.tsx:598-601` `openCreateFresh()` resets then opens. `button-create-event` calls it (`:1073`).
- AC3 (handleCreateAt unchanged): `:603-611` still sets startDate/endDate = day, startTime = hour, endTime = `plusOneHour`, then opens. Success reset at `:490` is untouched.
- AC4 (gate): `timeout 300 npx vitest run` gave 20 files / 234 tests passed. `npm run check` (tsc) was clean.

Base was known (`Base: ea43782`). The PRD file was found in `prds-archived/`.

## Findings

### Critical
- None.

### Important
- None.

### Minor
- No test covers the stale-prefill scenario (`calendar.tsx:593-601`). It is verified by reading only, and the PRD named no test.
- `handleCreateAt` (`:603`) spreads `form.getValues()`. This is harmless now, because every close path resets, but it would keep stale values if a new path opened the dialog without `closeCreate`.

Review: no secrets, input handling or path changes in the diff. The `/code-review` and `/security-review` pass was a self-review of the 18-line diff.
