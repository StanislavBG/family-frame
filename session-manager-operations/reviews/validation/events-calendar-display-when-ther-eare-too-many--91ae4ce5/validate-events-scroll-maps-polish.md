# Validation: events scroll, Google Maps and detail polish

Base: 032e84c1b5d09511bda0a7c4d3064f919773249d (HEAD bfe95fe). Commits: 2d01951 (321), 59a0348 (322), 966b00c (323), ec2ded0 (324), bfe95fe (326).
Gates re-run on HEAD: `npm run check` exit 0; `npx vitest run` 20 files / 246 tests passed (covers the 321 and 322 unit gates).
`grep -rn openstreetmap client/src` -> no hits.

## 321-events-google-maps-url — VERIFIED
- `mapUrl` event-detail.ts:104-110 builds `https://www.google.com/maps/search/?api=1&query=<encoded>` from venue, address, city, region, postal, country; falls back to `lat,lon` (line 108); returns string.
- `hasMapLocation` event-detail.ts:98-101 (place fields or coordinates).
- Tests: `describe("mapUrl")` event-detail.test.ts:71, `describe("hasMapLocation")` :84.

## 322-events-month-cell-scroll — VERIFIED
- `monthCellItems` events.ts (after eventDayEntries): sessions then open (`allDay: true`), de-duplicated by eventId; tests events.test.ts:246.
- events-month.tsx: MAX_CHIPS, "+N more", "N open all day" and DAY_LINK removed; list wrapper `data-testid=events-month-cell-list-<iso>` with `min-h-0 flex-1 ... overflow-y-auto overscroll-contain`.
- Cell `h-[150px]` (was min-h-[104px]); day button `shrink-0`, aria-label keeps full count.
- EventChip `allDay`: `border border-dashed border-current`, aria-label suffix ", open all day"; chip onClick stopPropagation; no JS scroll handlers.

## 323-events-day-panel-scroll — VERIFIED
- pages/events.tsx panel wrapper: `lg:sticky lg:top-3 lg:flex lg:max-h-[calc(100dvh-5rem)] lg:flex-col`, no overflow-y-auto, comment names the h-14 header.
- events-day-panel.tsx: section `lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`, header `shrink-0`, content in `events-day-list` div with `lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain`. Existing testids kept. Nothing scrolls internally below lg.

## 324-events-list-maps-links — VERIFIED
- Row (events-day-panel.tsx) and AgendaCard (pages/events.tsx): outer div with the old testid, inner wouter Link `min-w-0 flex-1`, sibling `<a>` (target _blank, rel noopener noreferrer, `events-day-map-<id>` / `events-card-map-<id>`, aria-label `Open <venue or title> in Google Maps`) only when `hasMapLocation`.
- MAP_BTN `h-11 w-11`, MapPin + "Map" label, sky colours with dark: pair, not hover-only. No nested anchors.

## 326-events-hero-polish — VERIFIED
- event-hero.tsx: Back link in its own row above the header card; chips, title, when/where/distance/cost line; where is an `<a data-testid=link-event-where-map>` when hasMapLocation; summary not line-clamped.
- `event-primary-actions` pill row (min-h-11, rounded-full, SURFACE/LINE): Google Maps (`link-event-map`), Buy tickets, Register, Organizer website, all new-tab.
- HEADER_FACTS filter on buildEventFacts; dl only rendered when facts remain; event-detail.ts untouched by 326.
- Sources: `list-event-sources` under SectionLabel, `sourceLabel` = publisher, title, hostname (raw URL on parse error), `truncate`.
- Why/details headings `text-lg font-bold` SERIF; cards `CARD` = `rounded-2xl border p-4` with `space-y-3`. Trip plan/lodging/admission from 317 and useFitScale preserved; listed testids present.

## Review of combined diff
Self-review (no unsafe input handling: external URLs use encodeURIComponent or rel noopener noreferrer; no secrets, no new helper duplication).

## Findings
### Critical
- none
### Important
- none
### Minor
- event-hero.tsx: the "Details" card still renders its heading with an empty body when there are no remaining facts and no sources.
- event-hero.tsx (status banner): uses `space-y-2` and `text-xl` h2 rather than the `space-y-3` / `text-lg` used by the why/details cards (criterion only names the why/details cards, so within spec).
- events-day-panel.tsx / pages/events.tsx: JSX inside the new Link/wrapper is not re-indented (formatting only).
