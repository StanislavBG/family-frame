import type { PersonTimeline } from "@shared/person-views";

export interface DayTimelineLayout {
  windowStart: number;
  windowEnd: number;
  ticks: { minute: number; label: string }[];
  band: { left: number; width: number } | null;
  spans: { left: number; width: number; label: string; start: string; end: string }[];
  events: { left: number; time: string; kind: string; label: string }[];
}

const MIN_WINDOW = 240;
const DAY = 1440;

function toMinutes(time: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function spanMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return 0;
  return Math.max(0, e - s);
}

export function formatDurationMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function tickLabel(minute: number, isFirst: boolean): string {
  const hour = Math.floor(minute / 60) % 24;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  // Meridiem only at the first tick and where it changes (noon, midnight).
  return isFirst || hour === 0 || hour === 12 ? `${display} ${suffix}` : String(display);
}

export function layoutDayTimeline(timeline: PersonTimeline | undefined): DayTimelineLayout | null {
  if (!timeline) return null;

  const start = toMinutes(timeline.start);
  const end = toMinutes(timeline.end);
  const spans = (timeline.spans ?? []).flatMap((s) => {
    const a = toMinutes(s.start);
    const b = toMinutes(s.end);
    return a === null || b === null ? [] : [{ ...s, a, b: Math.max(a, b) }];
  });
  const events = (timeline.events ?? []).flatMap((e) => {
    const t = toMinutes(e.time);
    return t === null ? [] : [{ ...e, t }];
  });

  const all: number[] = [];
  if (start !== null) all.push(start);
  if (end !== null) all.push(end);
  for (const s of spans) all.push(s.a, s.b);
  for (const e of events) all.push(e.t);
  if (all.length === 0) return null;

  let windowStart = Math.floor(Math.min(...all) / 60) * 60;
  let windowEnd = Math.ceil(Math.max(...all) / 60) * 60;
  if (windowEnd - windowStart < MIN_WINDOW) {
    const deficitHours = (MIN_WINDOW - (windowEnd - windowStart)) / 60;
    windowStart -= Math.floor(deficitHours / 2) * 60;
    windowEnd += Math.ceil(deficitHours / 2) * 60;
    // Shift back inside the day, keeping the width.
    if (windowStart < 0) {
      windowEnd -= windowStart;
      windowStart = 0;
    }
    if (windowEnd > DAY) {
      windowStart -= windowEnd - DAY;
      windowEnd = DAY;
    }
    windowStart = Math.max(0, windowStart);
  }

  const range = windowEnd - windowStart;
  const pct = (minute: number) =>
    Math.min(100, Math.max(0, ((minute - windowStart) / range) * 100));
  const seg = (a: number, b: number) => {
    const left = pct(a);
    return { left, width: Math.max(0, pct(b) - left) };
  };

  const ticks: DayTimelineLayout["ticks"] = [];
  for (let m = windowStart; m <= windowEnd; m += 60) {
    ticks.push({ minute: m, label: tickLabel(m, m === windowStart) });
  }

  const band =
    start === null && end === null
      ? null
      : seg(start ?? windowStart, Math.max(start ?? windowStart, end ?? windowEnd));

  return {
    windowStart,
    windowEnd,
    ticks,
    band,
    spans: spans.map((s) => ({ ...seg(s.a, s.b), label: s.label, start: s.start, end: s.end })),
    events: events
      .sort((x, y) => x.t - y.t)
      .map((e) => ({ left: pct(e.t), time: e.time, kind: e.kind, label: e.label })),
  };
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Calendar-day arithmetic on YYYY-MM-DD strings (UTC, so DST never shifts the date). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekday index (0 = Sunday) of a YYYY-MM-DD string. */
export function weekdayOfIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The Monday on or before a YYYY-MM-DD date. */
export function mondayOfIso(iso: string): string {
  return addDaysIso(iso, -((weekdayOfIso(iso) + 6) % 7));
}

/** Today's day, else the newest past day, else the soonest future one. */
export function pickCurrentDay<T extends { date: string }>(days: T[], todayIso: string): T | undefined {
  const past = days.filter((d) => d.date <= todayIso).sort((a, b) => b.date.localeCompare(a.date));
  if (past.length > 0) return past[0];
  return [...days].sort((a, b) => a.date.localeCompare(b.date))[0];
}

/**
 * The week containing today (weekStart <= today < weekStart + 7), else the nearest
 * past week, else the soonest upcoming one. Publishers send future weeks on purpose.
 */
export function pickCurrentWeek<T extends { weekStart: string }>(weeks: T[], todayIso: string): T | undefined {
  const valid = weeks.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.weekStart ?? ""));
  const past = valid.filter((w) => w.weekStart <= todayIso).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  if (past.length > 0) return past[0];
  return valid.sort((a, b) => a.weekStart.localeCompare(b.weekStart))[0];
}

export function isCurrentWeek(weekStart: string, todayIso: string): boolean {
  return weekStart <= todayIso && todayIso < addDaysIso(weekStart, 7);
}

/** "13:07" -> "1:07" (12-hour, no meridiem), as the daily sheet shows times. */
export function formatClock12(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]) % 12;
  return `${h === 0 ? 12 : h}:${m[2]}`;
}

/** Hour label for the timeline axis: meridiem on the first and last hour and at noon. */
export function axisHourLabel(minute: number, isEdge: boolean): string {
  const hour = Math.floor(minute / 60) % 24;
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return isEdge || hour === 12 ? `${display} ${suffix}` : String(display);
}

/** Half-hour grid lines strictly inside the window; whole hours are solid, half hours dashed. */
export function halfHourTicks(windowStart: number, windowEnd: number): { left: number; dashed: boolean }[] {
  const range = windowEnd - windowStart;
  const ticks: { left: number; dashed: boolean }[] = [];
  if (range <= 0) return ticks;
  for (let m = windowStart + 30; m < windowEnd; m += 30) {
    ticks.push({ left: ((m - windowStart) / range) * 100, dashed: m % 60 !== 0 });
  }
  return ticks;
}

/**
 * Assigns each event (sorted by left %) a lane so labels closer than `minGap` %
 * don't overlap, and events inside a `blocked` range (a span box drawn in lane 0)
 * start at lane 1. Returns one lane index per event.
 */
export function eventLanes(
  lefts: number[],
  minGap: number,
  blocked: { left: number; width: number }[] = [],
): number[] {
  const laneEnds: number[] = [];
  return lefts.map((left) => {
    const inSpan = blocked.some((b) => left > b.left - minGap / 2 && left < b.left + b.width + minGap / 2);
    let lane = laneEnds.findIndex((end, i) => i >= (inSpan ? 1 : 0) && left - end >= minGap);
    if (lane === -1) {
      lane = Math.max(laneEnds.length, inSpan ? 1 : 0);
      while (laneEnds.length < lane) laneEnds.push(-Infinity);
      laneEnds[lane] = left;
    } else {
      laneEnds[lane] = left;
    }
    return lane;
  });
}

export type EventTone = "dry" | "wet" | "bm" | "other";

/** Diaper kinds get the daily sheet's fixed colours; anything else is "other". */
export function eventTone(kind: string): EventTone {
  const k = kind.trim().toLowerCase();
  if (k === "dry" || k === "wet" || k === "bm") return k;
  return "other";
}

/** Short type label for an event pill: "BM", "Dry", "Wet", else the event label. */
export function eventTypeLabel(kind: string, label: string): string {
  const tone = eventTone(kind);
  if (tone === "bm") return "BM";
  if (tone === "dry") return "Dry";
  if (tone === "wet") return "Wet";
  return label;
}

/** 42 day cells (6 weeks) covering a month, starting on Monday or Sunday. */
export function buildMonthCells(year: number, month: number, weekStartsMonday: boolean): { iso: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = weekStartsMonday ? (first.getUTCDay() + 6) % 7 : first.getUTCDay();
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month, 1 - lead + i));
    cells.push({ iso: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month });
  }
  return cells;
}
