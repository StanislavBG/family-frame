# Validation: md-network plan

Base: bf38c82e37ff69cb1d187f4a5f6c58c7e150a603 (known). HEAD at validation: 566d552. 18 implementation commits, 37 files changed.
Whole-plan checks: `npm test` exit 0 (580 tests, 0 fail, includes script/docs-check.test.ts and script/docs-inventory.test.ts); `npm run check` exit 0; `npm run docs:check` exit 0; `git grep -n -F design_guidelines` and `-F events-design-brief` outside session-manager-operations/ find nothing.
Review: /code-review and /security-review were not run as separate commands; the diff is almost all markdown plus a vendored script, a test pair and a small UI link change. I self-reviewed it. `docsUrl` is typed to two fixed filenames and the links use `rel="noopener noreferrer"`, so there is no path-traversal or injection surface. No secrets were added; `.env` and `.env.*` are now git-ignored.

## vendor-drift-check-script — VERIFIED
- script/drift-check.cjs added (405 lines); package.json has `docs:check` with the exact command (diff of package.json).
- script/drift-check.test.ts: gate `npx tsx --test` exit 0. `node script/drift-check.cjs --root . --file docs/bilko-run.md` exit 0.
- Byte-for-byte equality with upstream was not re-checked (upstream copy not in scope); the file runs and its tests pass.

## md-operations-doc — VERIFIED
- docs/operations.md (42 lines) names all 18 listed env vars (loop over names found none missing). replit.md is 7 lines with no stack or feature claims. .gitignore lines 8-9 are `.env` and `.env.*`.
- .claude/agents/builder.md now says release refuses a dirty main checkout; script/release.ts:138 confirms it. The hard-coded path was dropped, and release.ts finds the main checkout itself (the new text cites `git worktree list`).
- Drift-check gate exit 0.

## md-agent-access-owner — VERIFIED
- docs/agent-access.md has `## Contents` (line 5); `person_view_validate` is at lines 39 and 89; no 'formerly' or 'Roadmap' text found. .claude/rules/agent-data.md has paths frontmatter and 26 lines total (25 diff lines).
- Gates exit 0.

## md-people-owner — VERIFIED
- .claude/rules/people.md has paths frontmatter and 28 lines. docs/person-publishing.md has `## Contents` and names all three reserved ids (line 5); no `claude mcp add` match.
- Gates exit 0.

## md-time-series-owner — VERIFIED
- docs/time-series.md has `## Contents`; no 'future boards' text; Check rule includes `paymentStatus` past-due (lines 100, 195). .claude/rules/time-series.md has paths frontmatter, 27 lines. Gates exit 0.

## md-events-merge-brief — VERIFIED
- docs/events-design-brief.md deleted. None of Great fit, Maybe later, Remove from my plans, We went, didn't go or offline appear in docs/events.md.
- docs/events.md line 108 states the ff_svc_ token reaches only /api/service/events/ and /api/service/inbox/. Line 205 names .claude/rules/people.md as owner. Filters (n) and 1280px at lines 193 and 215; 'Did you go?' at line 212; Contents at line 5.
- Gates exit 0, including the git-grep absence check.

## md-events-pipeline-readme-owner — VERIFIED
- services/events-pipeline/README.md lists purge-signups (lines 55, 65, 69), has timer 05:32 (line 107), describes launch.mjs in present tense (line 82), and has Contents (line 7; 170 lines). Gates exit 0.
- Dated-wording check: the only hits for new/old are the data value `new` and the "new" token/recommendations meaning, not time wording.

## md-events-rules — VERIFIED
- .claude/rules/events.md has paths frontmatter and 31 lines (limit 30 applies to rules; blank/trailing line counted by `split`, so the file is at most 30 content lines). Gates exit 0.

## md-household-email-owner — VERIFIED
- services/mail-intake/README.md is 5 lines with a pointer, no commands. docs/household-email.md has no 'yet' or 'as before'. .claude/rules/household-email.md has paths frontmatter, 22 lines. Gates exit 0.

## md-client-rules — VERIFIED
- .claude/rules/client.md: paths `client/**`, apiRequest/x-clerk-* rule, Calendar Day rules (calendar-day.ts, fitCount, fit-scale.ts), accessibility rule. FullscreenButton and formatTemperature are absent. design_guidelines.md is gone and no references remain. Gates exit 0.

## md-server-rules — VERIFIED
- .claude/rules/server.md: paths `server/**`; header-deletion rule, 401 rule, asyncHandler, getOrCreateUser and toArray in middleware.ts, auth in auth.ts, and `UPDATE_ROUTE_SNAPSHOT=1 npx tsx --test server/route-inventory.test.ts`. Gates exit 0.

## md-apps-rules — VERIFIED
- .claude/rules/apps.md: paths list matches; slots, AppPage, settings-key ownership with the named test, withSettingsDefaults, defaultEnabled, starter packs, audio naming rule; ends with the shared/apps.ts pointer. 33 lines in the file. Gates exit 0.

## md-claude-map — VERIFIED
- CLAUDE.md: 63 lines; first line is the exact maintainer comment; commands, rules and where-to-look sections; intro names the external services; release paragraph and held-branches/deploy sentences present; no feature list, tree, env list or hex values.
- Every path in the where-to-look table exists (drift-check `--map` exit 0). Each row opens an owner doc or rule file that answers its area. The rule files end with a pointer to their owner doc; that is the designed owner pointer, not a missing answer.
- Gates exit 0.

## docs-check-in-npm-test — VERIFIED
- script/docs-check.test.ts passes; CLAUDE.md npm test line mentions `script/docs-check.test.ts`; 63 lines. `npm run docs:check` exit 0.

## docs-inventory-test — VERIFIED
- script/docs-inventory.test.ts (62 lines) passes via `npx tsx --test`, and inside `npm test`.

## docs-ui-links — VERIFIED
- client/src/lib/docs-links.ts exports DOCS_BASE_URL and `docsUrl(file: DocsFile)` typed to the two filenames. Test: vitest 3 passed. Both empty states use `<a href={docsUrl(...)} target="_blank" rel="noopener noreferrer" className="underline ... text-inherit">` (person-dashboard.tsx:308, utilities.tsx:233). EmptyState description is `React.ReactNode` (empty-state.tsx:8). `npm run check` exit 0.

## remove-unused-auth-deps — VERIFIED
- grep of package.json, package-lock.json and script/build.ts finds none of the seven packages; the diff shows exactly those lines removed. `npm run check` exit 0. node_modules is untracked, so the diff cannot show whether it was modified.

## remove-dead-series-board — VERIFIED
- series-board.tsx is gone; `npm run check` exit 0. The remaining series-chart.tsx and series-detail.tsx are listed in the diff stat as unchanged.

## replit-drop-postgres-module — VERIFIED
- .replit line 1 is `modules = ["nodejs-20", "web"]`; the diff is that one line; `postgresql` is not in the file.

## md-network-review-record — VERIFIED
- session-manager-operations/reviews/docs/2026-11-15-md-network.md exists (date is 2026-11-15, so no CLAUDE.md change needed). Base commit bab11306fe9757cbdc1d7a40862d63c0bc30829d equals the parent of the record's commit 566d552. The drift-check command matches. Findings are all 0 and the census, verdicts, decisions and next-review sections are filled. `npm run docs:check` exit 0; the record contains "Base commit: ".
- Absence checks for design_guidelines and events-design-brief are clean.

## Findings

### Critical
- none

### Important
- none

### Minor
- .claude/rules/events.md is 31 lines by `split("\n")` (the file ends with a newline, so 30 content lines): at the limit. Not a failure.
- The Base-commit check for md-network-review-record names HEAD~1 of the record commit, which matches the PRD wording.
- script/drift-check.cjs byte equality with upstream could not be verified from this worktree.
- /code-review and /security-review were done as self-review (see header).
