# Validation: events web-tools fix (190, 191)

Base: 67a518ac (given). Commits: a0482fa (190), 1f32350 (191). PRD files found in `prds-archived/`.
Gate (both PRDs): `npm run events:test` -> 140/140 pass, exit 0; `npm run events:check` -> exit 0.
(Worktree had no node_modules; temporarily symlinked the main repo's and removed it afterwards.)

## 190 events-haiku-allow-web-tools — VERIFIED
- `--allowedTools` with `tools.join(",")` right after `--tools`; `--permission-mode dontAsk` and other args unchanged: services/events-pipeline/haiku.ts:163-167.
- Non-empty `permission_denials` -> `fail("failed", "tool permission denied: <distinct names>")`: haiku.ts:94-100 (checked before structured_output/result). Failure counted under failures.failed, asserted in test.
- Tests: args test asserts `--allowedTools` == `WebSearch,WebFetch` (haiku.test.ts:43); new test asserts ok=false, reason failed, detail `tool permission denied: WebSearch, WebFetch` (deduped), `usage().failures.failed === 1`.
- Gate green (above).

## 191 events-discover-count-invalid-candidates — VERIFIED
- `invalidCandidates: number` in DiscoverStats, init 0, `+= res.invalid` next to `stats.candidates` (discover.ts:55, 117, 258); no other fields changed.
- Test with one valid + two invalid candidates asserts candidates 1, invalidCandidates 2 (discover.test.ts:205-210).
- Gate green (above).

## Findings
No Critical or Important findings. Self-review of the 4-file diff (code-review/security-review not run as separate skills): no secrets, no new input paths; tool list is internal and still guarded against write-capable tools.
- Minor: haiku.ts:97 — denial entries lacking a string `tool_name` are reported as `unknown`; acceptable.
- Minor: scope held to the PRDs' listed files only.
