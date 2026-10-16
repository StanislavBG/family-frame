import type { CalendarEvent, Person } from "@shared/schema";
import { toMinutes } from "@shared/events-visit";

/**
 * Pure layout logic for the Calendar Day view (hour-by-hour breakdown).
 * Dates are YYYY-MM-DD strings and times HH:MM, all household-local; no Date objects.
 */

export interface TimedDayEntry {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  column: number;
  columns: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface CalendarDayLayout {
  allDay: CalendarEvent[];
  birthdays: Person[];
  timed: TimedDayEntry[];
  startHour: number;
  endHour: number;
}

const DAY_MINUTES = 1440;
const DEFAULT_DURATION = 60;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;

function clampHour(h: number): number {
  return Math.max(0, Math.min(24, h));
}

/** The minute span an event occupies on `dayIso`, or null when it belongs in the all-day row. */
function spanOnDay(
  event: CalendarEvent,
  dayIso: string,
): Pick<TimedDayEntry, "startMin" | "endMin" | "continuesBefore" | "continuesAfter"> | null {
  if (!event.startTime) return null;
  const multiDay = event.endDate > event.startDate;
  const start = toMinutes(event.startTime);
  const end = event.endTime ? toMinutes(event.endTime) : null;

  if (!multiDay) {
    const endMin = end !== null && end > start ? end : start + DEFAULT_DURATION;
    return { startMin: start, endMin: Math.min(endMin, DAY_MINUTES), continuesBefore: false, continuesAfter: false };
  }
  if (dayIso === event.startDate) {
    return { startMin: start, endMin: DAY_MINUTES, continuesBefore: false, continuesAfter: true };
  }
  if (dayIso === event.endDate) {
    return { startMin: 0, endMin: end ?? DEFAULT_DURATION, continuesBefore: true, continuesAfter: false };
  }
  return null;
}

/** Assigns `column` / `columns` so overlapping entries sit side by side. Entries must be sorted. */
function assignColumns(entries: TimedDayEntry[]): void {
  let cluster: TimedDayEntry[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = 0;

  const close = () => {
    for (const e of cluster) e.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const entry of entries) {
    if (cluster.length > 0 && entry.startMin >= clusterEnd) close();
    let col = columnEnds.findIndex((end) => end <= entry.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(entry.endMin);
    } else {
      columnEnds[col] = entry.endMin;
    }
    entry.column = col;
    cluster.push(entry);
    clusterEnd = cluster.length === 1 ? entry.endMin : Math.max(clusterEnd, entry.endMin);
  }
  close();
}

export function layoutCalendarDay(events: CalendarEvent[], people: Person[], dayIso: string): CalendarDayLayout {
  const allDay: CalendarEvent[] = [];
  const timed: TimedDayEntry[] = [];

  for (const event of events) {
    if (event.startDate > dayIso || event.endDate < dayIso) continue;
    const span = spanOnDay(event, dayIso);
    if (!span) {
      allDay.push(event);
      continue;
    }
    timed.push({ event, ...span, column: 0, columns: 1 });
  }

  allDay.sort((a, b) => a.title.localeCompare(b.title));
  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  assignColumns(timed);

  const monthDay = dayIso.slice(5, 10);
  const birthdays = people.filter((p) => p.birthday && p.birthday.slice(5, 10) === monthDay);

  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  if (timed.length > 0) {
    startHour = Math.min(startHour, Math.floor(timed[0].startMin / 60));
    endHour = Math.max(endHour, Math.ceil(Math.max(...timed.map((t) => t.endMin)) / 60));
  }

  return { allDay, birthdays, timed, startHour: clampHour(startHour), endHour: clampHour(endHour) };
}

/** Format a stored HH:MM (24h) time using the user's 12h/24h setting. */
export function formatTimeOfDay(hhmm: string, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Label for an hour gridline, 0..24 (24 reads as midnight). */
export function formatHourLabel(hour: number, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:00`;
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "PM" : "AM"}`;
}
