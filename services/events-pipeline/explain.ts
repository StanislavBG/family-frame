import type { EventCategory, FfEvent } from "../../shared/events";
import type { HaikuRunner } from "./haiku";

// Writes the household-specific text on each recommendation with one Haiku
// session per household batch. The prompt carries only a privacy-safe digest
// (city, member ages, preferences) and the event JSON, never an address,
// names or birthdays. A deterministic template fills anything the model
// does not deliver.

export const EXPLAIN_MAX_PICKS = 12;
const MAX_WHY = 1000;
const MAX_LINE = 200;
const MAX_LINES = 5;
const MAX_DESCRIPTION_IN_PROMPT = 1200;

export interface ExplainDigest {
  city: string;
  memberAges: number[];
  likedCategories: EventCategory[];
  preferenceLines: string[];
}

export interface ExplainPick {
  event: FfEvent;
  matchReasons: string[];
  distanceKm?: number;
}

export interface ExplainText {
  whyForHousehold: string;
  whyForChildren?: string;
  highlights: string[];
  tips: string[];
}

export const EXPLAIN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["eventId", "whyForHousehold", "highlights", "tips"],
        properties: {
          eventId: { type: "string" },
          whyForHousehold: { type: "string", maxLength: 600 },
          whyForChildren: { type: "string", maxLength: 600 },
          highlights: { type: "array", maxItems: 5, items: { type: "string", maxLength: MAX_LINE } },
          tips: { type: "array", maxItems: 5, items: { type: "string", maxLength: MAX_LINE } },
        },
      },
    },
  },
} as const;

const hasChild = (d: ExplainDigest) => d.memberAges.some((a) => a < 18);
const clip = (s: string, max: number) => s.trim().slice(0, max).trim();
const label = (c: string) => c.replace(/-/g, " ");

function cleanLines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => clip(x, MAX_LINE))
    .filter((x) => x.length > 0)
    .slice(0, MAX_LINES);
}

function costText(e: FfEvent): string {
  if (e.cost.isFree) return "free";
  if (e.cost.priceText) return clip(e.cost.priceText, 80);
  if (e.cost.minPrice !== undefined) {
    return `from ${e.cost.minPrice}${e.cost.currency ? ` ${e.cost.currency}` : ""}`;
  }
  return "paid";
}

export function templateExplain(pick: ExplainPick, digest: ExplainDigest): ExplainText {
  const e = pick.event;
  const parts: string[] = [];
  const reasons = pick.matchReasons.map((r) => r.trim()).filter(Boolean).slice(0, 3);
  if (reasons.length) parts.push(`${reasons.join("; ")}.`);
  const liked = digest.likedCategories.includes(e.category) ? " (a category you like)" : "";
  parts.push(`It is a ${label(e.category)} event${liked} in ${e.location.city}, ${costText(e)}.`);
  const out: ExplainText = {
    whyForHousehold: clip(parts.join(" "), MAX_WHY),
    highlights: [],
    tips: [],
  };
  if (hasChild(digest) && e.audience.familyFriendly) {
    out.whyForChildren = "Family friendly, suitable for children.";
  }
  const hl = [`Category: ${label(e.category)}`, `Cost: ${costText(e)}`];
  if (pick.distanceKm !== undefined) hl.push(`About ${Math.round(pick.distanceKm * 10) / 10} km away`);
  out.highlights = hl;
  if (e.cost.registrationRequired) out.tips.push("Registration is required.");
  else if (e.cost.ticketRequired) out.tips.push("A ticket is required.");
  if (e.location.setting === "outdoor") out.tips.push("Outdoors: check the weather before leaving.");
  return out;
}

function eventForPrompt(p: ExplainPick) {
  const e = p.event;
  return {
    eventId: e.id,
    title: e.title,
    summary: e.summary,
    description: e.description.slice(0, MAX_DESCRIPTION_IN_PROMPT),
    category: e.category,
    tags: e.tags,
    start: e.schedule.start,
    end: e.schedule.end,
    venue: e.location.venueName,
    city: e.location.city,
    setting: e.location.setting,
    online: e.location.online,
    cost: e.cost.isFree ? { isFree: true } : { isFree: false, priceText: e.cost.priceText, minPrice: e.cost.minPrice, maxPrice: e.cost.maxPrice, currency: e.cost.currency },
    ticketRequired: e.cost.ticketRequired,
    registrationRequired: e.cost.registrationRequired,
    ageBands: e.audience.ageBands,
    ageMin: e.audience.ageMin,
    ageMax: e.audience.ageMax,
    familyFriendly: e.audience.familyFriendly,
    strollerFriendly: e.audience.strollerFriendly,
    status: e.status,
    matchReasons: p.matchReasons,
    distanceKm: p.distanceKm,
  };
}

export function buildExplainPrompt(digest: ExplainDigest, picks: ExplainPick[]): string {
  const kids = hasChild(digest);
  return [
    "You write short, warm, plain-language notes explaining why each event suits one household.",
    "Stay strictly factual to the event JSON below: do not invent details, prices, times or places that are not in it.",
    "",
    "Household digest:",
    `- City: ${digest.city}`,
    `- Member ages: ${digest.memberAges.length ? digest.memberAges.join(", ") : "unknown"}`,
    `- Liked categories: ${digest.likedCategories.length ? digest.likedCategories.join(", ") : "none stated"}`,
    ...digest.preferenceLines.map((l) => `- ${l}`),
    "",
    "For every event return: eventId (copied exactly), whyForHousehold (1-3 sentences, at most 600 characters),",
    kids
      ? "whyForChildren (1-2 sentences about what children in the household will enjoy, only if the event suits them),"
      : "no whyForChildren (there are no children in this household),",
    "highlights (up to 5 short lines) and tips (up to 5 short practical lines, each at most 200 characters).",
    "Do not mention names, addresses or birthdays. Return only the JSON object.",
    "",
    "Events:",
    JSON.stringify(picks.map(eventForPrompt)),
  ].join("\n");
}

function parseItems(data: unknown): Map<string, ExplainText> {
  const out = new Map<string, ExplainText>();
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.eventId !== "string" || typeof r.whyForHousehold !== "string") continue;
    const why = clip(r.whyForHousehold, MAX_WHY);
    if (!why || out.has(r.eventId)) continue;
    const kids = typeof r.whyForChildren === "string" ? clip(r.whyForChildren, MAX_WHY) : "";
    const text: ExplainText = { whyForHousehold: why, highlights: cleanLines(r.highlights), tips: cleanLines(r.tips) };
    if (kids) text.whyForChildren = kids;
    out.set(r.eventId, text);
  }
  return out;
}

export async function explainBatch(
  runner: HaikuRunner,
  digest: ExplainDigest,
  picks: ExplainPick[],
): Promise<Map<string, ExplainText>> {
  const result = new Map<string, ExplainText>();
  if (picks.length === 0) return result;
  const batch = picks.slice(0, EXPLAIN_MAX_PICKS);

  let parsed = new Map<string, ExplainText>();
  try {
    const run = await runner.run({
      prompt: buildExplainPrompt(digest, batch),
      jsonSchema: EXPLAIN_JSON_SCHEMA,
      tools: [],
    });
    if (run.ok) parsed = parseItems(run.data);
  } catch {
    // fall back to templates below
  }

  const childOk = hasChild(digest);
  for (const p of picks) {
    const ai = batch.includes(p) ? parsed.get(p.event.id) : undefined;
    if (!ai) {
      result.set(p.event.id, templateExplain(p, digest));
      continue;
    }
    if (!childOk) delete ai.whyForChildren;
    result.set(p.event.id, ai);
  }
  return result;
}
