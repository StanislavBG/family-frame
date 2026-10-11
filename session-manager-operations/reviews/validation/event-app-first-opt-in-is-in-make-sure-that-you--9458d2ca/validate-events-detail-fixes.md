# Validation: events detail fixes (PRDs 201, 202, 203)

Base: 2db50b81663da17861a127ddef0eb8817b85ff62. Commits: e89ed4a (202), 8c0d0e9 (201), ca4b237 (203).
Gates re-run in the worktree (node_modules symlinked to the main checkout's, since the worktree had none):
`npm run check` exit 0; `npm test` exit 0 (vitest 91/91, node:test 345/345); `npm run events:check` exit 0; `npm run events:test` exit 0 (155/155).
PRD files read from `prds-archived/`. `/code-review` and `/security-review` were not run; I self-reviewed the diff instead.

## 201 events-hero-back-link-and-where-summary — VERIFIED
- BackLink `href="/"`: event-hero.tsx:106.
- Summary line with `data-testid="event-where-summary"`: event-hero.tsx:200-216. It uses `mapUrl(location)`, `target="_blank"`, `rel="noopener noreferrer"`, a MapPin icon, and venue + address, falling back to city/region, "Online event", then "See map". Distance is appended when present. It sits in the header block after the date/time, before Highlights.
- The Where section is intact (event-hero.tsx:317-327). It uses the `tone.fg` token, which has dark variants, and the information is always visible.
- Gate: check and npm test green.

## 202 events-collect-parking-and-access — VERIFIED
- normalize.ts:39-41 (zod, max 20/500/500) and :107-109 (JSON schema). normalize.ts:331-333 copies the trimmed non-empty values. Tests at normalize.test.ts:34-47 cover mapping, blank values dropped, and `ffEventSchema` passing.
- search.ts:179 adds the prompt rule. search.test.ts:118 asserts it, and still asserts that "742 Evergreen" and "line1" are absent. The new rule text contains no household address.
- Gate: events:test and events:check green.

## 203 events-recheck-fills-missing-details — VERIFIED
- dispatch.ts:94-101 (zod) and :152-160 (`CHECK_JSON_SCHEMA.location`). The prompt lists the missing fields (dispatch.ts:176-191).
- applyResult (dispatch.ts:226-242) fills only fields the stored event lacks. It truncates to the limits (address 300, postal code 20, notes 500), appends one `details-changed` update, and the result is parsed through `ffEventSchema` (:254).
- Tests at dispatch.test.ts:191-236. A missing parkingNotes leads to one push and a details-changed update, with the existing accessibility note kept. A returned address for an event that already has one is not applied, and nothing is pushed.
- Gate: events:test and events:check green.

## Findings
### Critical
- none
### Important
- none
### Minor
- event-hero.tsx:215-221: distance is shown twice, in the new summary and in the existing distance/cost line. The PRD asked for it in the summary, so this is cosmetic.
- event-hero.tsx:163-166: an online event that also has city/region shows the city rather than "Online event". This matches the PRD wording ("city/region when there is no address").
- dispatch.ts:~239: the update summary reads "Added location details: parking notes" rather than the PRD's example "Added parking and accessibility details". The PRD said "like", and the tests assert /parking/i.
- normalize.ts: the raw `address` max is 400 but `ffEventSchema` allows 300. This predates these PRDs.
- Environment: the job worktree lacked node_modules. Running the gates needed a symlink, which is gitignored and was not committed.
