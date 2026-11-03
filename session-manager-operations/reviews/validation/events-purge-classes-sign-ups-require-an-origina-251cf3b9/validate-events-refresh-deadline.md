# Validation: events-refresh-run-deadline

Base c723e0e; PRD 418 (archived). Commit 86596e9 touches only the 5 listed files.

## events-refresh-run-deadline — VERIFIED
- dispatch.ts: `stopAtMs`/`clock` in DispatchOptions; `stoppedAtDeadline` in DispatchStats (optional on the exported type, always set in runDispatch's `RunStats`, initial false); check at top of loop before the Haiku call, so a running check finishes.
- cli.ts:19 `ALL_REFRESH_STOP_MS = 195 * 60_000` exported; cli.ts:423 `stopAtMs: t0 + ALL_REFRESH_STOP_MS` only when `args.mode === "all"`; `CliDeps.runDispatch` injected, default the real one; `t0` defined at cli.ts:322 before the mode branches.
- dispatch.test.ts: fake-clock test (4 due, 2 checked, stoppedAtDeadline true) and no-stopAtMs test (4 checked, false).
- cli.test.ts: one test, `all` stopAtMs within [before, after] + ALL_REFRESH_STOP_MS; `refresh` undefined.
- README.md Locking: states 195 min stop, running check finishes, remainder rolls over.
- Gate re-run: `npm run events:test` 286 pass / 0 fail; `npm run events:check` clean.
- Diff self-reviewed (no new input handling, secrets or paths; no helper duplication).

## Findings
- Critical: none. Important: none.
- Minor: `stoppedAtDeadline` is optional on `DispatchStats` (needed for push-only callers) — acceptable. The `cli.test.ts` bound check is a range, not exact (t0 comes from Date.now()), as disclosed.
