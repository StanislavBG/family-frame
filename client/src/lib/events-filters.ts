// Pure model for the Events filter groups: Show, When, What, How far, Cost, Who, Topic.
// "Sat & Sun" (things on those days) is separate from "Weekend getaways" (trip ideas).
import { EVENT_CATEGORIES, type EventCategory } from "@shared/events";
import { suitsPeople, isSignUpActivity } from "@shared/events-activity";
import { dayWindows } from "@shared/events-visit";
import { isPaidOrTicketed, isTripIdea, matchesTripFilter, type EventItem } from "./events";

export type ResponseFilter = "active" | "new" | "interested" | "going" | "hidden";
export type WhenFilter = "any" | "this-weekend" | "weekends";
export type KindFilter = "all" | "classes" | "day-trip" | "weekend";
export type DistanceFilter = "any" | "close" | "local";
export type CostFilter = "any" | "free" | "paid";

export interface EventFilters {
  response: ResponseFilter;
  when: WhenFilter;
  kind: KindFilter;
  distance: DistanceFilter;
  cost: CostFilter;
  category: EventCategory | null;
  people: string[];
}

export const DEFAULT_FILTERS: EventFilters = {
  response: "active",
  when: "any",
  kind: "all",
  distance: "any",
  cost: "any",
  category: null,
  people: [],
};

export const FILTER_LABELS = {
  response: [
    { id: "active", label: "All open" },
    { id: "new", label: "New" },
    { id: "interested", label: "Interested" },
    { id: "going", label: "Going" },
    { id: "hidden", label: "Not for us" },
  ],
  when: [
    { id: "any", label: "Any day" },
    { id: "this-weekend", label: "This weekend" },
    { id: "weekends", label: "Sat & Sun" },
  ],
  kind: [
    { id: "all", label: "Everything" },
    { id: "classes", label: "Classes & sign-ups" },
    { id: "day-trip", label: "Day trips" },
    { id: "weekend", label: "Weekend getaways" },
  ],
  distance: [
    { id: "any", label: "Any distance" },
    { id: "close", label: "Close to home" },
    { id: "local", label: "Nearby" },
  ],
  cost: [
    { id: "any", label: "Any price" },
    { id: "free", label: "Free" },
    { id: "paid", label: "Paid / Ticketed" },
  ],
} as const;

export interface EventsBrowse {
  view: "agenda" | "month";
  filters: EventFilters;
  /** null follows today, so wall displays roll over at midnight. */
  selectedDate: string | null;
  month: string | null;
  lastDay: string | null;
}

export const DEFAULT_BROWSE: EventsBrowse = {
  view: "agenda",
  filters: DEFAULT_FILTERS,
  selectedDate: null,
  month: null,
  lastDay: null,
};

export interface FilterContext {
  today: string;
  ages: number[];
}

const ids = <T extends string>(list: readonly { id: T }[]): readonly T[] => list.map((x) => x.id);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

/** Rebuild saved browse state; unknown values fall back field by field, bad dates are dropped. */
export function parseBrowse(raw: unknown): EventsBrowse {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const f = o.filters && typeof o.filters === "object" ? (o.filters as Record<string, unknown>) : {};
  const people = Array.isArray(f.people)
    ? Array.from(new Set(f.people.filter((p): p is string => typeof p === "string" && p !== ""))).slice(0, 50)
    : [];
  return {
    view: o.view === "month" ? "month" : "agenda",
    filters: {
      response: pick(f.response, ids(FILTER_LABELS.response), DEFAULT_FILTERS.response),
      when: pick(f.when, ids(FILTER_LABELS.when), DEFAULT_FILTERS.when),
      kind: pick(f.kind, ids(FILTER_LABELS.kind), DEFAULT_FILTERS.kind),
      distance: pick(f.distance, ids(FILTER_LABELS.distance), DEFAULT_FILTERS.distance),
      cost: pick(f.cost, ids(FILTER_LABELS.cost), DEFAULT_FILTERS.cost),
      category: pick(f.category, EVENT_CATEGORIES, "other") === f.category ? (f.category as EventCategory) : null,
      people,
    },
    selectedDate: parseDate(o.selectedDate),
    month: parseDate(o.month),
    lastDay: parseDate(o.lastDay),
  };
}

/** Number of groups that differ from their default. */
export function activeFilterCount(filters: EventFilters): number {
  const d = DEFAULT_FILTERS;
  return [
    filters.response !== d.response,
    filters.when !== d.when,
    filters.kind !== d.kind,
    filters.distance !== d.distance,
    filters.cost !== d.cost,
    filters.category !== d.category,
    filters.people.length > 0,
  ].filter(Boolean).length;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Date predicate for a When choice. */
export function dayAllowed(when: WhenFilter, todayIso: string): (date: string) => boolean {
  if (when === "any") return () => true;
  const dow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (when === "weekends") return (date) => {
    const w = new Date(`${date}T00:00:00Z`).getUTCDay();
    return w === 0 || w === 6;
  };
  const onWeekend = dow === 0 || dow === 6;
  const start = onWeekend ? todayIso : addDaysIso(todayIso, 6 - dow);
  const end = addDaysIso(todayIso, (7 - dow) % 7);
  return (date) => date >= start && date <= end;
}

const HIDDEN = new Set(["not-interested", "dismissed"]);

function matchesResponse(item: EventItem, filter: ResponseFilter): boolean {
  if (filter === "active") return !HIDDEN.has(item.response);
  if (filter === "hidden") return HIDDEN.has(item.response);
  return item.response === filter;
}

function matchesWhen(item: EventItem, when: WhenFilter, today: string): boolean {
  if (when === "any" || isTripIdea(item)) return true;
  const ok = dayAllowed(when, today);
  return dayWindows(item.event, { from: today, maxDays: 120 }).some((w) => ok(w.date));
}

function matchesKind(item: EventItem, kind: KindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "classes") return !isTripIdea(item) && isSignUpActivity(item.event);
  return isTripIdea(item) && matchesTripFilter(item, kind);
}

function matchesGroups(item: EventItem, f: EventFilters, ctx: FilterContext, skipKind: boolean): boolean {
  if (!matchesResponse(item, f.response)) return false;
  if (!matchesWhen(item, f.when, ctx.today)) return false;
  if (!skipKind && !matchesKind(item, f.kind)) return false;
  if (f.distance !== "any" && !matchesTripFilter(item, f.distance)) return false;
  if (f.cost === "free" && !item.event.cost.isFree) return false;
  if (f.cost === "paid" && !isPaidOrTicketed(item)) return false;
  if (f.category && item.event.category !== f.category) return false;
  if (f.people.length > 0 && ctx.ages.length > 0 && !suitsPeople(item.event.audience, ctx.ages)) return false;
  return true;
}

export function matchesFilters(item: EventItem, filters: EventFilters, ctx: FilterContext): boolean {
  return matchesGroups(item, filters, ctx, false);
}

export function isUpcoming(item: EventItem, today: string): boolean {
  if (isTripIdea(item)) return true;
  return dayWindows(item.event, { from: today, maxDays: 120 }).length > 0;
}

/** Counts for the What group, honouring every other group. */
export function kindCounts(
  items: EventItem[],
  filters: EventFilters,
  ctx: FilterContext,
): { classes: number; "day-trip": number; weekend: number } {
  const counts = { classes: 0, "day-trip": 0, weekend: 0 };
  for (const item of items) {
    if (item.withdrawn || !isUpcoming(item, ctx.today)) continue;
    if (!matchesGroups(item, filters, ctx, true)) continue;
    for (const k of ["classes", "day-trip", "weekend"] as const) if (matchesKind(item, k)) counts[k]++;
  }
  return counts;
}

/** Categories in use, in EVENT_CATEGORIES order with "other" last. */
export function topicOptions(items: EventItem[]): EventCategory[] {
  const used = new Set(items.map((i) => i.event.category));
  const ordered = EVENT_CATEGORIES.filter((c) => c !== "other" && used.has(c));
  return used.has("other") ? [...ordered, "other"] : ordered;
}
