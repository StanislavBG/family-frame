# Markdown network review 2026-11-15

- Date: 2026-11-15
- Mode: Full review (audit ran 2026-11-12; approved 2026-11-15)
- Scope: the whole project
- Base commit: bab11306fe9757cbdc1d7a40862d63c0bc30829d
- Owner: Bilko
- Map: CLAUDE.md
- Drift-check command: node script/drift-check.cjs --root . --exclude session-manager-operations/
- Findings counts: broken-link 0, missing-path 0, over-line-limit 0, no-contents-list 0
- Census summary: 83 files, 4570 lines, 75.9% of files (63) and 61.0% of lines (2786) machine-written (under session-manager-operations/; counted at the base commit, before this record)

## Verdicts

| Doc | Verdict | Owner doc |
| --- | --- | --- |
| CLAUDE.md | KEEP-OWNER | map |
| docs/operations.md | KEEP-OWNER | new |
| docs/agent-access.md | KEEP-OWNER | itself |
| docs/person-publishing.md | KEEP-OWNER | itself |
| docs/time-series.md | KEEP-OWNER | itself |
| docs/events.md | KEEP-OWNER | itself |
| docs/household-email.md | KEEP-OWNER | itself |
| docs/bilko-run.md | KEEP-OWNER | itself |
| services/events-pipeline/README.md | KEEP-OWNER | itself |
| .claude/agents/builder.md | KEEP-OWNER | itself |
| .claude/rules/ (8 path-scoped rule files) | KEEP-OWNER | themselves |
| services/mail-intake/README.md | SHRINK-TO-POINTER | docs/household-email.md |
| replit.md | SHRINK-TO-POINTER | CLAUDE.md and docs/operations.md |
| docs/events-design-brief.md | MERGE-INTO | docs/events.md |
| design_guidelines.md | DELETE | facts now in .claude/rules/client.md and client/src/index.css |
| session-manager-operations/reviews/validation/ | machine-written records read by script/release.ts (kept, outside the map) | script/release.ts |

## Decisions

- The human approved the restructure on 2026-11-15.
- Drift gate: the vendored script/drift-check.cjs runs inside npm test (script/docs-check.test.ts); periodic reviews still use the Review MD network macro.
- Unbuilt items of the Events design brief (Great fit, Maybe later, Remove from my plans, We went / We didn't go, offline banner) were dropped with it; git log -- docs/events-design-brief.md recovers them.
- docs/household-email.md documents the shipped operator-Gmail design; a replacement design is a product decision outside the docs.
- Rules live in path-scoped .claude/rules/ files, not nested CLAUDE.md files, because the Events, People and Utilities rules span client/, server/, shared/ and services/.
- Terms: release = npm run release to GitHub main; deploy = Replit pull + Publish; publish = agents writing data.
- replit.md is a pointer, not deleted, because Replit Agent reads it by convention.

## Follow-up PRDs

- vendor-drift-check-script
- md-operations-doc
- md-agent-access-owner
- md-people-owner
- md-time-series-owner
- md-events-merge-brief
- md-events-pipeline-readme-owner
- md-events-rules
- md-household-email-owner
- md-client-rules
- md-server-rules
- md-apps-rules
- md-claude-map
- docs-check-in-npm-test
- docs-inventory-test
- docs-ui-links
- remove-unused-auth-deps
- remove-dead-series-board
- replit-drop-postgres-module

## Next review due

2027-02-15, or sooner after a major model release.
