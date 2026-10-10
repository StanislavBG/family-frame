import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  EventCategory,
  EventPreferences,
  EventStatus,
  FeedbackEntry,
  FfEvent,
  HouseholdResponse,
  PatchPlan,
  PostFeedback,
  PostResponse,
} from "@shared/events";
import type { SatchelTone } from "@/components/person/satchel";
import { apiRequest, queryClient } from "./queryClient";
import { queryKeys } from "./api";

export interface EventsStatus {
  sharingEnabled: boolean;
  addressComplete: boolean;
  lastPublishedAt: string | null;
  counts: { new: number; going: number; interested: number; changed: number };
}

export interface EventRecExplanation {
  whyForHousehold: string;
  whyForChildren?: string;
  highlights: string[];
  tips: string[];
  matchScore: number;
  matchReasons: string[];
  distanceKm?: number;
  travelMinutes?: number;
}

export interface EventItem {
  eventId: string;
  event: FfEvent;
  rec: EventRecExplanation;
  response: HouseholdResponse;
  feedback?: { relevance?: string; sentiment?: string; steer?: string };
  calendar?: { calendarEventId: string; visibility: "Shared" | "Private" };
  plan?: { occurrenceStart?: string; notes?: string; people?: string[] };
  hasUnseenUpdate: boolean;
  withdrawn: boolean;
  recommendedAt: string;
}

export interface EventItemsParams {
  from?: string;
  to?: string;
  includeHidden?: boolean;
}

export type TimeFormat = "12h" | "24h";

function withQuery(path: string, entries: Array<[string, string | number | undefined]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function buildEventItemsUrl(params: EventItemsParams = {}): string {
  return withQuery("/api/events/items", [
    ["from", params.from],
    ["to", params.to],
    ["include", params.includeHidden ? "all" : undefined],
  ]);
}

const itemUrl = (id: string) => `/api/events/items/${encodeURIComponent(id)}`;

const get = <T>(url: string) => apiRequest<T>("GET", url);

function invalidateEvents(alsoCalendar: boolean) {
  queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/events/"),
  });
  if (alsoCalendar) queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events() });
}

export function useEventsStatus() {
  return useQuery({
    queryKey: queryKeys.events.status(),
    queryFn: () => get<EventsStatus>("/api/events/status"),
  });
}

export function useEventItems(params: EventItemsParams = {}) {
  return useQuery({
    queryKey: queryKeys.events.items(params),
    queryFn: () => get<EventItem[]>(buildEventItemsUrl(params)),
  });
}

export function useEventItem(id: string) {
  return useQuery({
    queryKey: queryKeys.events.item(id),
    queryFn: () => get<EventItem>(itemUrl(id)),
    enabled: id !== "",
  });
}

export function useRespond(id: string) {
  return useMutation({
    mutationFn: (input: PostResponse) => apiRequest<EventItem>("POST", `${itemUrl(id)}/response`, input),
    onSuccess: () => invalidateEvents(true),
  });
}

export function useSendFeedback(id: string) {
  return useMutation({
    mutationFn: (input: PostFeedback) =>
      apiRequest<{ signal: FeedbackEntry }>("POST", `${itemUrl(id)}/feedback`, input),
    onSuccess: () => invalidateEvents(false),
  });
}

export function useUpdatePlan(id: string) {
  return useMutation({
    mutationFn: (input: PatchPlan) => apiRequest<EventItem>("PATCH", `${itemUrl(id)}/plan`, input),
    onSuccess: () => invalidateEvents(true),
  });
}

export function useMarkSeen(id: string) {
  return useMutation({
    mutationFn: () => apiRequest<void>("POST", `${itemUrl(id)}/seen`),
    onSuccess: () => invalidateEvents(false),
  });
}

export function useEventPreferences() {
  return useQuery({
    queryKey: queryKeys.events.preferences(),
    queryFn: () => get<EventPreferences>("/api/events/preferences"),
  });
}

export function useSaveEventPreferences() {
  return useMutation({
    mutationFn: (input: EventPreferences) =>
      apiRequest<EventPreferences>("PUT", "/api/events/preferences", input),
    onSuccess: () => invalidateEvents(false),
  });
}

export function useFeedbackLog() {
  return useQuery({
    queryKey: queryKeys.events.feedback(),
    queryFn: () => get<FeedbackEntry[]>("/api/events/feedback"),
  });
}

export function useDeleteEventData() {
  return useMutation({
    mutationFn: () => apiRequest<void>("DELETE", "/api/events/data"),
    onSuccess: () => invalidateEvents(true),
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const CATEGORY_META: Record<EventCategory, { label: string; tone: SatchelTone }> = {
  "parks-outdoors": { label: "Parks & outdoors", tone: "leaf" },
  "nature-animals": { label: "Nature & animals", tone: "leaf" },
  "kids-activities": { label: "Kids activities", tone: "clay" },
  "baby-toddler": { label: "Baby & toddler", tone: "clay" },
  "sports-fitness": { label: "Sports & fitness", tone: "sky" },
  "arts-culture": { label: "Arts & culture", tone: "plum" },
  "music-performance": { label: "Music & performance", tone: "sky" },
  "museums-learning": { label: "Museums & learning", tone: "plum" },
  "festivals-fairs": { label: "Festivals & fairs", tone: "sun" },
  "faith-church": { label: "Faith & church", tone: "stone" },
  "food-markets": { label: "Food & markets", tone: "sun" },
  "community-volunteering": { label: "Community & volunteering", tone: "leaf" },
  "holiday-seasonal": { label: "Holiday & seasonal", tone: "clay" },
  "family-entertainment": { label: "Family entertainment", tone: "sun" },
  other: { label: "Other", tone: "stone" },
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function safeZone(tz: string): string | undefined {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** YYYY-MM-DD of an ISO value as seen in the given timezone. */
export function dateKeyInZone(iso: string, tz: string): string {
  if (DATE_ONLY.test(iso)) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

type ScheduleLike = Pick<FfEvent["schedule"], "timezone" | "start" | "end" | "allDay" | "occurrences">;

function startDates(item: { event: { schedule: ScheduleLike } }): string[] {
  const { schedule } = item.event;
  const starts = schedule.occurrences.length > 0 ? schedule.occurrences.map((o) => o.start) : [schedule.start];
  return starts.map((s) => dateKeyInZone(s, schedule.timezone)).sort();
}

/**
 * Next 14 days = today (offset 0) through offset 13, grouped per day; anything
 * from offset 14 on goes to `later`. An event's day is its first occurrence on
 * or after today; events already past (all occurrences and the end) are dropped.
 */
export function groupForAgenda<T extends { event: { schedule: ScheduleLike } }>(
  items: T[],
  todayIso: string,
): { next14: { date: string; items: T[] }[]; later: T[] } {
  const today = dayNumber(todayIso);
  const dated: { date: string; item: T }[] = [];
  for (const item of items) {
    const { schedule } = item.event;
    let date = startDates(item).find((d) => d >= todayIso);
    if (!date) {
      const end = schedule.end ? dateKeyInZone(schedule.end, schedule.timezone) : undefined;
      if (end && end >= todayIso) date = todayIso;
    }
    if (date) dated.push({ date, item });
  }
  dated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const next14: { date: string; items: T[] }[] = [];
  const later: T[] = [];
  for (const { date, item } of dated) {
    if (dayNumber(date) - today < 14) {
      const last = next14[next14.length - 1];
      if (last && last.date === date) last.items.push(item);
      else next14.push({ date, items: [item] });
    } else {
      later.push(item);
    }
  }
  return { next14, later };
}

function formatDay(iso: string, tz: string): string {
  if (DATE_ONLY.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(tz),
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTime(iso: string, tz: string, timeFormat: TimeFormat): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(tz),
    hour: timeFormat === "12h" ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  }).format(new Date(iso));
}

/** "Sat, Oct 24 · 10:00 AM – 4:00 PM" in the event's timezone, plus "+N more dates". */
export function formatWhen(schedule: ScheduleLike, timeFormat: TimeFormat = "24h"): string {
  const tz = schedule.timezone;
  const more = schedule.occurrences.length - 1;
  const suffix = more > 0 ? ` · +${more} more ${more === 1 ? "date" : "dates"}` : "";
  const startDay = formatDay(schedule.start, tz);
  const endKey = schedule.end ? dateKeyInZone(schedule.end, tz) : undefined;
  const multiDay = endKey !== undefined && endKey !== dateKeyInZone(schedule.start, tz);

  if (schedule.allDay) {
    const range = multiDay && schedule.end ? `${startDay} – ${formatDay(schedule.end, tz)}` : startDay;
    return `${range} · All day${suffix}`;
  }
  const startTime = formatTime(schedule.start, tz, timeFormat);
  let text: string;
  if (!schedule.end) text = `${startDay} · ${startTime}`;
  else if (multiDay) {
    text = `${startDay} ${startTime} – ${formatDay(schedule.end, tz)} ${formatTime(schedule.end, tz, timeFormat)}`;
  } else text = `${startDay} · ${startTime} – ${formatTime(schedule.end, tz, timeFormat)}`;
  return text + suffix;
}

/** "Venue, City" style single line; online events read "Online". */
export function formatWhere(location: FfEvent["location"]): string {
  if (location.online) return location.venueName ? `Online · ${location.venueName}` : "Online";
  return [location.venueName, location.city].filter(Boolean).join(", ");
}

function money(value: number, currency?: string): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  if (!currency) return value.toFixed(digits);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

export function formatCost(cost: FfEvent["cost"]): string {
  if (cost.isFree) return "Free";
  if (cost.priceText) return cost.priceText;
  const { minPrice: min, maxPrice: max, currency } = cost;
  if (min !== undefined && max !== undefined) {
    return min === max ? money(min, currency) : `${money(min, currency)} – ${money(max, currency)}`;
  }
  if (min !== undefined) return `From ${money(min, currency)}`;
  if (max !== undefined) return `Up to ${money(max, currency)}`;
  return "See details";
}

type UpdateLike = Pick<FfEvent["updates"][number], "at" | "kind">;

const STATUS_BADGES: Partial<Record<EventStatus, { label: string; tone: SatchelTone }>> = {
  cancelled: { label: "Cancelled", tone: "clay" },
  postponed: { label: "Postponed", tone: "sun" },
  rescheduled: { label: "Rescheduled", tone: "sun" },
  "sold-out": { label: "Sold out", tone: "plum" },
  "moved-online": { label: "Moved online", tone: "sky" },
  tentative: { label: "Tentative", tone: "stone" },
  ended: { label: "Ended", tone: "stone" },
};

const UPDATE_BADGES: Partial<Record<UpdateLike["kind"], { label: string; tone: SatchelTone }>> = {
  "price-changed": { label: "Price changed", tone: "sun" },
  "time-changed": { label: "Time changed", tone: "sun" },
  "venue-changed": { label: "Venue changed", tone: "sun" },
  "details-changed": { label: "Details changed", tone: "sky" },
};

/** Badge for a non-normal status, else for the latest notable update; null when nothing to flag. */
export function statusBadge(
  status: EventStatus,
  updates: readonly UpdateLike[] = [],
): { label: string; tone: SatchelTone } | null {
  const fromStatus = STATUS_BADGES[status];
  if (fromStatus) return fromStatus;
  const latest = [...updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return (latest && UPDATE_BADGES[latest.kind]) || null;
}
