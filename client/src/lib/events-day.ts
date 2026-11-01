import { isOngoingClass } from "@shared/events-activity";
import { eventDayEntries, type DayEntry, type EventItem } from "./events";
import { addDaysIso, weekdayOfIso } from "./person-day";

export type DaySectionKey = "morning" | "afternoon" | "evening" | "classes" | "open";

export interface DaySection {
  key: DaySectionKey;
  title: string;
  entries: DayEntry<EventItem>[];
}

export interface DayStripDay {
  iso: string;
  count: number;
  isToday: boolean;
  isWeekend: boolean;
}

const TITLES: Record<DaySectionKey, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  classes: "Classes you can sign up for",
  open: "Open all day",
};
const ORDER: DaySectionKey[] = ["morning", "afternoon", "evening", "classes", "open"];
const STRIP_DAYS = 7;

/** Part of day for an HH:MM start: before 12:00, before 17:00, else evening. */
function partOfDay(hhmm: string): "morning" | "afternoon" | "evening" {
  if (hhmm < "12:00") return "morning";
  if (hhmm < "17:00") return "afternoon";
  return "evening";
}

/** A day's events grouped by part of day; empty sections are left out. */
export function dayViewSections(items: EventItem[], dateIso: string): DaySection[] {
  const { sessions, open } = eventDayEntries(items, dateIso);
  const buckets: Record<DaySectionKey, DayEntry<EventItem>[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    classes: [],
    open: [],
  };
  for (const entry of sessions) buckets[partOfDay(entry.window.open)].push(entry);
  for (const entry of open) buckets[isOngoingClass(entry.item.event) ? "classes" : "open"].push(entry);
  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: TITLES[key],
    entries: buckets[key],
  }));
}

/** Seven days to jump across: from today while selected is within it, else from selected. */
export function dayStrip(items: EventItem[], selectedIso: string, todayIso: string): DayStripDay[] {
  const inWindow = selectedIso >= todayIso && selectedIso <= addDaysIso(todayIso, STRIP_DAYS - 1);
  const start = inWindow ? todayIso : selectedIso;
  const days: DayStripDay[] = [];
  for (let i = 0; i < STRIP_DAYS; i++) {
    const iso = addDaysIso(start, i);
    const { sessions, open } = eventDayEntries(items, iso);
    const ids = new Set<string>();
    for (const { item } of sessions) ids.add(item.eventId);
    for (const { item } of open) if (!isOngoingClass(item.event)) ids.add(item.eventId);
    const weekday = weekdayOfIso(iso);
    days.push({ iso, count: ids.size, isToday: iso === todayIso, isWeekend: weekday === 0 || weekday === 6 });
  }
  return days;
}

/** The date for a real YYYY-MM-DD, else null (2026-02-31 is rejected). */
export function parseDayParam(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}
