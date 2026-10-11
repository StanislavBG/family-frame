# Validation: Events wall density (PRDs 205, 206, 207)

Base: 3170bb469e3a3dcbe54d7a1627ecdc0b2a7d2b64 · Head: d2001f2 · Commits: 9e3bd7e (205), d5f7e05 (206), d2001f2 (207).

Gate (`npm run check`, `npm test`, `npm run build`) re-run in the main checkout (same commit d2001f2; the job worktree has no node_modules): check exit 0, test exit 0 (vitest + 345/345 node:test pass), build exit 0.

## 205 event-detail-wall-layout — VERIFIED
- `buildEventFacts` exported, rows in spec order, each only when present: client/src/lib/event-detail.ts:62-92; `distanceText`/`whereSummary`/`mapUrl` exported; Cost omits priceText when equal (line 76).
- Tests: client/src/lib/event-detail.test.ts (+69 lines; passes in vitest run).
- 3-column lg grid `lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]`, gaps gap-3, p-4: event-hero.tsx:168; col 1 actions + banner (169-216), col 2 merged why/kids/highlights+tips (218-243), col 3 Details dl + link list (245-262). Title lg:text-3xl, summary lg:line-clamp-3 (153, 165). No max-w-3xl on the article.
- Duplicate cards and `event-actions-bottom` gone (grep of event-hero.tsx: no match).
- useFitScale wiring: containerRef on `h-full overflow-y-auto` wrapper, contentRef/contentStyle on article (129-140); single column in the same order below lg.
- Testids present: event-hero-<id>, event-hero-header, text-event-title, text-event-when, event-where-summary, text-event-cost, text-event-distance, event-status-banner, list-event-updates, text-event-status-note, section-why-household, list-match-reasons, section-why-children, section-highlights, link-event-map/tickets/registration/back, chip-event-category/status, section-details.
- Links use `min-h-11` (LINK, BackLink). Colours via SATCHEL_TONES / literal `dark:` pairs.

## 206 event-actions-compact — VERIFIED
- Root `space-y-2`; response group `grid-cols-1 sm:grid-cols-3`: event-actions.tsx:247-248.
- Feedback block `p-2 space-y-2`, axes in `grid grid-cols-1 gap-2 lg:grid-cols-3`, each axis `grid-cols-2 gap-1.5 lg:grid-cols-1`: lines 320-324.
- `BIG_BUTTON = "min-h-11 text-base font-semibold"` (line 50); redundant min-h-12 removed; calendar/decline panels `p-2 space-y-2` (272, 288).
- Diff is class-only (16 lines): testids, aria-*, mutations untouched.

## 207 events-overview-dense-agenda — VERIFIED
- `agendaColumns` events.ts:259-282: greedy fill by ceil(total/columns), never splits a day, exactly N arrays, columns<1 -> 1.
- Four tests added (events.test.ts:131-157) cover empty, date order, balance, columns=1/0.
- Overview: single wrapping toolbar row, no SectionLabel "Show" (events.tsx:~196-262); h1 text-2xl; `p-3 lg:p-4`, `space-y-3`; Chip min-h-11 px-3 text-sm lg:text-base (BTN, line 46-47).
- Next 14 days: `lg:grid lg:grid-cols-3 lg:gap-3` over `agendaColumns(next14, 3)`, stacking chronologically below lg; Later: `grid gap-2 lg:grid-cols-3 xl:grid-cols-4`.
- AgendaCard: DateBadge size 44, p-2.5, title text-base line-clamp-2, meta text-sm with chips inline, day heading text-base. All listed testids retained; `dark:` pairs unchanged.

## Findings

### Critical
- none

### Important
- none

### Minor
- client/src/pages/events.tsx: the diff reformats large unrelated regions (prettier-style line wrapping in Overview, EventsContent, formatPublished). Behaviour is unchanged but it inflates the diff and hides the real change.
- client/src/components/events/event-hero.tsx:54: HeroSkeleton still uses `max-w-3xl space-y-4 p-4`, so the loading state is narrower than the loaded 3-column page (layout jump at lg). Not in the PRD criteria.
- No DOM tests exist for the hero/agenda layout; the 1920x1080 fit was not exercised in a browser by this validation (only code and gates were checked).
- The fit-scale wrapper in event-hero.tsx:129 is `h-full` inside events.tsx:421's `h-full overflow-y-auto`; correct per PRD 205 note, but relies on the parent having a definite height.

Review checks: every light colour has a `dark:` pair in the touched files; class strings are literal (no runtime-built Tailwind names); data-testids kept; no hover-only information added; interactive targets are min-h-11 (44px). No secrets, unsafe input handling or path traversal introduced (external hrefs use `rel="noopener noreferrer"`, map URL is `encodeURIComponent`-encoded).
