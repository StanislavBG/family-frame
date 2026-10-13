# Validation: household email organize plan

Base: 5266aa8 (the base also spans earlier plans; organize commits reviewed are c9e7a8e..625ac26). All five PRD files found in `prds-archived/`.
Gates re-run (Node 22.22.1; worktree had no node_modules, so I temporarily symlinked the main checkout's and removed it afterwards):
- `tsx --test server/household-inbox-organize.test.ts server/household-inbox-schema.test.ts` → 16/16 pass
- `tsx --test server/household-inbox-routes.test.ts server/route-inventory.test.ts` → 18/18 pass
- `npm run inbox:test` → 51/51 pass; `npm run inbox:check` → exit 0
- `npm run check` → exit 0; `npm test` → vitest 206 pass, node:test 464 pass
- `events:test` not run: `services/events-pipeline/haiku.ts` is unchanged in these commits.

## inbox-organize-apply — VERIFIED (c9e7a8e)
- BILL_CATEGORIES (8 values) + organizedRequestSchema with two refines (bill iff kind bill, day iff daily-report): shared/household-inbox.ts:142-207.
- applyOrganized + deps shape; unknown mail → 404: server/household-inbox-organize.ts:53-62.
- Series id `mail-<slug>-<category>`, capped at 64 chars: :40-44. putSeries only on getSeries 404 (never overwrites), tags ['utilities'], flat annotations: :65-83. putPoints with dueDate/emailId/currency: :84-96.
- Daily report: person check → 400, record id `mail-<mailId>`, source 'household-email', nap spans labelled 'Nap', personIds: :101-127. Email re-upserted with kind; `other` is a no-op: :46-51, :63.
- Tests cover all listed cases and pass.

## inbox-organize-route — VERIFIED (5801ff9)
- Route, 403 unless x-ff-auth=service, 404 unless inbox enabled and organize enabled (state re-read per call), 200 → applyOrganized: server/household-inbox-routes.ts:142-157.
- Injectable organizeDeps with default wiring; errors → handleError: :26-31, :81.
- Route snapshot has exactly one added line (snapshot.json:49). New route tests pass.

## mail-intake-organize — VERIFIED (6eea6d5)
- organizeMessage: runner.run({prompt, jsonSchema, tools: []}); null on throw/!ok/invalid: services/mail-intake/organize.ts:101-139.
- Prompt holds only received date, sender, subject, text cut to 12000 inside UNTRUSTED markers, plus an ignore-instructions line: :79-99. No profile data.
- daily-report only with personId (personId injected from input, not from Haiku); otherwise becomes other: :123-132.
- haiku.ts: `tools.join(",")` of [] yields `--tools ""` (haiku.ts:163-164), so no fix was needed and the file is unchanged. Tests pass.

## mail-intake-organize-wire — VERIFIED (4a6a173)
- ff.organized(householdId, body), householdId URL-encoded, shared post helper: ff-inbox-client.ts.
- runOnce organize dep, cap default 20, only on `delivered` with organize:true, counts organized/organizeFailed, never throws: run.ts:40-96, :130-139.
- Organize failures leave the message labelled ff-routed (the label happens after the switch, unaffected).
- CLI skips the runner when INBOX_ORGANIZE=off; createHaikuRunner({maxSessions:1, cwd: temp dir}), temp dir removed in finally: cli.ts:113-133.

## household-email-organize-docs — VERIFIED (625ac26)
- docs/household-email.md §4 Organize: opt-in, series/point/dueDate, ff-person-day, chips, INBOX_ORGANIZE=off, 20-call cap, pinned Haiku cost, privacy bullets, attachments not handled.
- CLAUDE.md Household email subsection: all four rules added (lines ~282-285).

## Security focus
- No tools: `tools: []` → `--tools ""`; FORBIDDEN_TOOLS guard remains. OK.
- Prompt content: email only, delimited, no profile data. OK.
- Consent: re-checked on every organized call (route :148-151). OK.
- Existing series never overwritten: OK (see Minor 1 for points).

## Findings
### Critical
- none
### Important
- none
### Minor
1. server/household-inbox-organize.ts:84 — putPoints upserts by `t`; a second bill for the same vendor/category with the same billDate overwrites that point's value, and the point `t` is set by Haiku from untrusted email text. Series metadata is safe, but a crafted email could replace an existing point of a `mail-*` series. Low impact (private, opted-in, `mail-` namespace only).
2. services/events-pipeline/haiku.test.ts — no test pins that `tools: []` yields an empty `--tools` argument; the "no tools" guarantee rests on the CLI treating `--tools ""` as none. Add a one-line argv test.
3. docs/household-email.md and CLAUDE.md state `INBOX_ORGANIZE=off` / the 20-call cap beyond what the PRD required (harmless, accurate).
4. The worktree lacks node_modules, so gates only run after linking one; not a code defect.
