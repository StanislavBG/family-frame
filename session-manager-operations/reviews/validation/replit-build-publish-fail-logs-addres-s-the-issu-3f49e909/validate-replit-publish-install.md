# Validation: Replit publish install (vitest 4 + @clerk/react)

Base: 4b1f836. Commits: aeec04b (vitest), 94b6bc9 (clerk). Both PRDs' gates re-run in this worktree.

## upgrade-vitest-drop-tinypool — VERIFIED
- package.json:84 `"vitest": "^4.1.11"` (not 5.x).
- package-lock.json: node_modules/vitest = 4.1.11; no node_modules/tinypool entry; `npm ls tinypool` -> empty.
- `npm audit --audit-level=critical` -> exit 0 (high/moderate remain, out of scope).
- `npx vitest run` -> 2 files, 9 tests pass; `tsx --test` -> 77 pass, 0 fail. vitest.config.ts unchanged.
- `npm ci` OK, `npm run check` exit 0, `npm run build` exit 0 (dist/index.cjs, dist/public present).

## migrate-clerk-react-sdk — VERIFIED
- package.json:15 `"@clerk/react": "^6.17.7"`; no `@clerk/clerk-react` in package.json, App.tsx, messages.tsx, calendar.tsx (grep count 0); lockfile has no node_modules/@clerk/clerk-react.
- App.tsx imports from "@clerk/react"; `<SignedIn>/<SignedOut>` -> `<Show when="signed-in"|"signed-out">` (same children); `afterSignOutUrl="/"` moved from UserButton to ClerkProvider (App.tsx ~712), preserving sign-out destination. messages.tsx/calendar.tsx: import swap only.
- @clerk/express left at ^2.1.77; server tests 77/77 pass, server/ untouched.
- Audit exit 0; check/test/build exit 0; absence check clean.

## Extra check
- engines.node: vitest `^20 || ^22 || >=24`; @clerk/react, express, backend, shared `>=20.9.0` — all admit Node 20. @vitest/* have no engines field.
- `npm audit --audit-level=critical` exit 0.

## Findings
### Critical
- none
### Important
- none
### Minor
- Sign-in flow not exercised in a browser (no local .env; per commit report); verified by tsc, tests, build only. `Show` semantics were not checked against the core-3 guide in this validation either.
- `Show when="signed-in"` renders nothing while Clerk is loading, as did SignedIn; no behavior difference expected.
