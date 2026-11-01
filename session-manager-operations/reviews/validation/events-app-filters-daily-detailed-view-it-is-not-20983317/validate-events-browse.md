# Validation: events browse plan (PRDs 376-392)

Base: 57b57f52deb64f1d0463184e3abf05f3b57f4420. All 17 PRD files found under `prds-archived/`.

## Whole-plan checks (re-run in the foreground)
- `npm run check` (tsc): exit 0, no errors.
- `npm test`: node:test 551 pass / 0 fail; vitest (`npx vitest run`) 34 files, 374 tests pass.
- `npm run build`: client built in 16.9s, server bundle `dist/index.cjs` written.
- Dark pairs: every `bg-/text-/border-[#...]` literal in events-filter-bar, events-classes-shelf, events-day-card and events-day-view has a `dark:` pair on its line (grep exited clean). The only non-hex hit is `text-white` in `SOLID` (events-filter-bar.tsx:28), which is paired with `dark:text-[#1a1612]`.
- Hover-only: grep for `hover:`, `group-hover`, `title=` and tooltips in the new components and the page finds only `hover:underline` on a decorative link (events.tsx:580) and page-level `title=` props that are not tooltips (events.tsx:653, 665). The info stays visible without hovering.
- Review: `/code-review` and `/security-review` were not run as skills; I self-reviewed the diff. Outbound sign-up links use `rel="noopener noreferrer"`, routes use encodeURIComponent, `parseDayParam` and `parseBrowse` validate input, and no secrets were found.

## Per PRD (evidence = file:line or command; each PRD's own tests are part of the green runs above)
- **events-filter-bar** VERIFIED. events-filter-bar.tsx:23-30 has `min-h-11` and solid/quiet tints, each with `dark:`; events-filter-bar.test.ts passes.
- **events-session-state** VERIFIED. use-session-state.ts and its test pass; event-hero.tsx:159 and events.tsx:270 use it with key `ff.events.browse.v1`.
- **events-filters-model** VERIFIED. events-filters.ts plus 176 test lines pass; parseBrowse is used at events.tsx:270.
- **events-page-filters** VERIFIED. events.tsx renders the filter bar; events.test.ts (296 lines) passes.
- **events-when-days** VERIFIED. Covered by the passing events.test.ts and lib/events.test.ts.
- **events-trips-month** VERIFIED. events.tsx:182 `events-trips-none`, :214 'No events match these filters.'.
- **events-classes-shelf** VERIFIED. events-classes-shelf.tsx:49 'Sign up'; the test passes.
- **events-classes-wire** VERIFIED. Covered by the passing events.test.ts.
- **events-day-logic** VERIFIED. events-day.ts plus its test pass; parseDayParam is used at events.tsx:636.
- **events-day-card** VERIFIED. events-day-card.tsx and its test pass; no unpaired light colours.
- **events-day-view** VERIFIED. events-day-view.tsx and its test pass.
- **events-day-route** VERIFIED. events.tsx:628 matches `/day/:date` before `/:eventId`; :636-637 redirect a bad date and a bare `day`; :302 replaces history; events-day-panel.tsx:151,163 give the aria-label and 'Open full day'; event-hero.tsx:159 reads lastDay.
- **events-panel-classes** VERIFIED. events-day-panel.test.ts passes.
- **events-hero-signup** VERIFIED. event-hero.tsx:225 `link-event-registration`; event-hero.test.ts and event-detail.test.ts pass.
- **events-response-people** VERIFIED. events-service.ts:589-590 `if (people !== undefined) plan.people = people`; events-service.test.ts passes.
- **events-who-picker** VERIFIED. event-hero.tsx:297 `text-event-people`; event-actions and event-hero tests pass.
- **events-browse-docs** VERIFIED. CLAUDE.md:285,288 list the modules and the useSessionState rule; docs/events.md mentions 'Sat & Sun' (2 hits).

## Findings
- Critical: none.
- Important: none.
- Minor: `/code-review` and `/security-review` skills were not run (self-review only). No visual check was done; the epic notes one is owed after PLAN SETTLED.
