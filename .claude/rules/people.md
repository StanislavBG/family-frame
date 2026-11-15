---
paths:
  - "client/src/pages/people.tsx"
  - "client/src/components/person/**"
  - "client/src/lib/person-day.ts"
  - "client/src/lib/person-view.ts"
  - "client/src/lib/fit-scale.ts"
  - "client/src/hooks/use-fit-scale.ts"
  - "shared/person-views.ts"
---

# People app (Satchel design)

- Design source: the claude.ai/design project "Satchel App" (with "Day Timeline Zoom" for the day timeline).
- Design tokens and primitives live in `client/src/components/person/satchel.tsx`.
- Colours come from `SATCHEL_TONES` as literal class strings (Tailwind scans source; never build class names at runtime); every light colour has a `dark:` pair.
- No hover-only information (wall display).
- Logic and date math live in `client/src/lib/person-day.ts` (pure, unit-tested), not in components.
- `PersonView` renders each section with `key={person.id}`, so sections need no reset-on-person-change effects; sections without data redirect to Dashboard once visibility queries settle.
- The Dashboard fits one wall screen by uniform scaling with `useFitScale()` (`client/src/hooks/use-fit-scale.ts`; 1024px wide and up, floor 0.6, scrolls below that), settling through the pure `stepFitScale` (`client/src/lib/fit-scale.ts`); never by dropping sections.
- "Today" comes from `useToday()` (`client/src/hooks/use-today.ts`), never `new Date()` at render.
- Inbox category chips come from `GET /api/mail/kinds`, tone from `kindChipTone` (`client/src/lib/agent-data.ts`); never hard-code kind names.
- Custom sections come from `ff-person-view` records (`client/src/lib/person-view.ts`, `client/src/components/person/person-view-section.tsx`), validated with MCP `person_view_validate`.
- List blocks support `urlField` (https only) and `sortField`/`sortDir`, sorted on the server before the limit.
- Datasets bound by a person's custom views are left out of that person's More tab (`moreSchemas`).

Publishing contract (per-person data, reserved schemas, view blocks): `docs/person-publishing.md`.
