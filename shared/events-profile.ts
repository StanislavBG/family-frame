// Household "flavor profile" for Events: life stages derived from member ages only.
// Pure, no imports. Band boundaries match BAND_RANGES in services/events-pipeline/search.ts.

export const LIFE_STAGES = [
  "baby",
  "toddler",
  "preschool",
  "school-age",
  "teen",
  "adults-only",
  "multi-generational",
] as const;

export type LifeStage = (typeof LIFE_STAGES)[number];

export const PROFILE_GUIDANCE =
  "Treat the household profile and preferences as hints, not filters, and still include some ideas outside them.";

const CHILD_BANDS: { stage: LifeStage; min: number; max: number; label: string; one: string; many: string }[] = [
  { stage: "baby", min: 0, max: 0, label: "under 1", one: "a baby", many: "babies" },
  { stage: "toddler", min: 1, max: 2, label: "1-2", one: "a toddler", many: "toddlers" },
  { stage: "preschool", min: 3, max: 5, label: "3-5", one: "a preschooler", many: "preschoolers" },
  { stage: "school-age", min: 6, max: 12, label: "6-12", one: "a school-age child", many: "school-age children" },
  { stage: "teen", min: 13, max: 17, label: "13-17", one: "a teen", many: "teens" },
];

const ADULT_AGE = 18;
const SENIOR_AGE = 65;
const GENERATION_SPAN = 30;

const UNKNOWN_LINES = ["Household make-up unknown."];

export function householdProfile(memberAges: number[]): { stages: LifeStage[]; lines: string[] } {
  const ages = memberAges.filter((a) => Number.isFinite(a) && a >= 0).map(Math.floor);
  if (ages.length === 0) return { stages: [], lines: [...UNKNOWN_LINES] };

  const adults = ages.filter((a) => a >= ADULT_AGE);
  const hasChild = adults.length < ages.length;
  const stages: LifeStage[] = [];
  const parts: string[] = [];

  for (const band of CHILD_BANDS) {
    const n = ages.filter((a) => a >= band.min && a <= band.max).length;
    if (n === 0) continue;
    stages.push(band.stage);
    parts.push(`${n === 1 ? band.one : `${n} ${band.many}`} (${band.label})`);
  }

  if (adults.length === ages.length) stages.push("adults-only");

  const spansGenerations =
    adults.length >= 3 && Math.max(...adults) - Math.min(...adults) >= GENERATION_SPAN;
  if ((adults.some((a) => a >= SENIOR_AGE) && hasChild) || spansGenerations) {
    stages.push("multi-generational");
  }

  const adultText = adults.length === 0 ? "" : adults.length === 1 ? "1 adult" : `${adults.length} adults`;
  const members = [adultText, ...parts].filter(Boolean);
  const joined = members.length > 1 ? `${members.slice(0, -1).join(", ")} and ${members[members.length - 1]}` : members[0];

  const lines = [`Household: ${joined}.`];
  if (stages.includes("multi-generational")) lines.push("Several generations are in the household.");
  if (stages.includes("adults-only")) lines.push("No children in the household.");
  return { stages, lines: lines.slice(0, 3) };
}
