# Validation: events original-source plan (PRDs 406-416)

Base: 9934ba0bb270ce0def8042c1488fa588adf0d9bd. Every PRD has commits in `git log 9934ba0..HEAD` (12 feature/merge commits, 36 files, +2540/-205).

## Gates (re-run in foreground at HEAD)
- `npm test`: 560 pass, 0 fail
- `npm run check`: tsc clean
- `npm run events:test`: 283 pass, 0 fail
- `npm run events:check`: tsc clean

## Verdicts
| PRD | Verdict | Evidence |
| --- | --- | --- |
| events-source-classifier (406) | VERIFIED | `shared/events-sources.ts` (+165) with `server/events-sources.test.ts` (+84) passing in `npm test`. |
| events-signup-button-official (407) | VERIFIED | `client/src/components/events/event-hero.tsx` and its test updated; client tests green. |
| events-link-checker (408) | VERIFIED | `services/events-pipeline/links.ts`; `links.test.ts:103-113` shows http and private-host (`private.test`) targets are `refused` with no request; `:70` dead on refused connection. Guards moved to `server/url-guards.ts`. |
| events-normalize-official-source (409) | VERIFIED | `normalize.ts` and `applySourcePolicy` in `sources.ts`, with tests green. |
| events-search-prompt-official (410) | VERIFIED | `search.ts` prompt changed and `search.test.ts` green. |
| events-discover-link-gate (411) | VERIFIED | `discover.test.ts:398,410,431` cover dead, moved and blocked official sources. |
| events-official-page-verify (412) | VERIFIED | `verify.ts:244` calls `runner.run({... tools: ["WebFetch"]})`, the only tools value; `verify.test.ts` green. |
| events-official-check-wire (413) | VERIFIED | `discover.test.ts:512` "a failed verify session publishes none of its picks" (fail closed); `:570`, `:580` cover the search reserve; DB v5 migration tested in `db.test.ts`; report lines in `report.ts`. |
| events-recheck-official (414) | VERIFIED | `dispatch.ts:403` skips any recommendation unless `response === "new" && !calendarLinked`, so only new, unlinked ones are withdrawn. `badLink` (`dispatch.ts:65`) covers dead, moved and refused. |
| events-purge-signups (415) | VERIFIED | `purge.ts` guards every write with `if (!dryRun)`; `purge.test.ts:110` "dry run changes nothing and idempotent second run". `cli.ts` wires the mode. |
| events-original-source-docs (416) | VERIFIED | `grep "loose on purpose"` over docs, README and CLAUDE.md finds nothing. `docs/events.md`, `services/events-pipeline/README.md` and `CLAUDE.md` updated. |

## Model pinning
The only `claude -p` call site is `services/events-pipeline/haiku.ts:159-160`, which passes `--model HAIKU_MODEL`. `verify.ts` goes through the same runner. No other `claude`/`--print` spawn exists in the pipeline. Clean.

## Review of the combined diff
I self-reviewed the diff (the `/code-review` and `/security-review` skills were not run).
- The link checker refuses non-https and private addresses and does not follow redirects automatically (`redirect: "manual"` in the test double). It reuses the SSRF guards, now shared in `server/url-guards.ts`, rather than duplicating them.
- The DB migration uses `ALTER TABLE ... ADD COLUMN` behind a column-exists check, inside a transaction.
- No secrets, `eval` or `child_process` additions.

## Findings
- Critical: none.
- Important: none.
- Minor: I did not run the live purge. It is a separate post-release step and was out of scope here.
