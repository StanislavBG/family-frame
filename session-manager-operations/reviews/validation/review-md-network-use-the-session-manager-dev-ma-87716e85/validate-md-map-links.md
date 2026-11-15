# Validation: md-map-markdown-links

Base: ba245e2 (commit 2d51c0f is the only one touching CLAUDE.md / script/docs-check.test.ts). PRD: 449-md-map-markdown-links.

## md-map-markdown-links — VERIFIED

- AC1: CLAUDE.md:35-48 table links every .md as `[path](path)`; non-.md (`bilko.listing.json`, `script/release.ts`, validation folder) stay in backticks.
- AC2: replit.md and services/mail-intake/README.md linked in the table.
- AC3: `wc -l CLAUDE.md` = 65 (<=70); line 1 is `<!-- md-network-map owner: Bilko last-review: 2026-11-15 -->`.
- AC4: script/docs-check.test.ts:94 second test "every tracked doc is reachable from CLAUDE.md by following links"; failure message lists unreachable docs (:114-118).
- AC5/Gate: `npx tsx --test script/docs-check.test.ts` -> 2 pass, 0 fail; `npm run docs:check` rc=0.
- Independent BFS (separate Python script, same link rules) from CLAUDE.md reached 20/20 tracked .md (CLAUDE.md + 19 others), 0 unreachable, 0 dangling.
- `npm test`: 581 pass, 0 fail.
- Review: self-review of diff (CLAUDE.md, test file only); no secrets, no network, git ls-files via spawnSync with fixed args; no path-traversal concern (read-only on tracked files).

## Findings

- Critical: none
- Important: none
- Minor: none
