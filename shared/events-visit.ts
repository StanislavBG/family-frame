// Pure helpers: turn an event schedule into per-day opening windows and suggest
// a short visit block inside a window. Runs in the browser and on the server.
import type { FfEvent } from "./events";

export interface DayWindow {
  date: string; // YYYY-MM-DD in the event's timezone
  open: string; // HH:MM
  close: string; // HH:MM
  hoursKnown: boolean;
  kind: "session" | "open";
  occurrenceStart?: string;
}

export interface VisitPrefs {
  visitBlockMinutes: number;
  visitEarliest: string;
  visitLatestEnd: string;
  preferredTimes?: ("morning" | "afternoon" | "evening")[];
}

export interface VisitBlock {
  date: string;
  start: string;
  end: string;
  wholeWindow: boolean;
}

export const DEFAULT_VISIT_PREFS = {
  visitBlockMinutes: 150,
  visitEarliest: "10:00",
  visitLatestEnd: "18:00",
  preferredTimes: [],
} satisfies VisitPrefs;

const DEFAULT_MAX_DAYS = 120;
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";
const DEFAULT_SESSION_MINUTES = 120;
const LAST_MINUTE = 23 * 60 + 59;
const STEP = 30;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

interface Local {
  date: string;
  time: string | null; // null for date-only input
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function fromMinutes(min: number): string {
  const c = Math.max(0, Math.min(LAST_MINUTE, Math.round(min)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    const make = (tz: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    try {
      f = make(timeZone);
    } catch {
      f = make("UTC");
    }
    formatterCache.set(timeZone, f);
  }
  return f;
}

function toLocal(value: string, timeZone: string): Local {
  if (DATE_ONLY.test(value)) return { date: value, time: null };
  if (HAS_ZONE.test(value)) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      const parts: Record<string, string> = {};
      for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value;
      const hour = parts.hour === "24" ? "00" : parts.hour;
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
    }
  }
  // Offset-less: literal wall-clock.
  return { date: value.slice(0, 10), time: value.length >= 16 ? value.slice(11, 16) : null };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sessionClose(open: string, endLocal: Local | null, openDate: string): string {
  const o = toMinutes(open);
  if (endLocal) {
    if (endLocal.date > openDate) return "23:59";
    if (endLocal.date === openDate && endLocal.time !== null && toMinutes(endLocal.time) > o) {
      return endLocal.time;
    }
  }
  return fromMinutes(Math.min(o + DEFAULT_SESSION_MINUTES, LAST_MINUTE));
}

export function dayWindows(
  event: FfEvent,
  opts: { from?: string; to?: string; maxDays?: number } = {},
): DayWindow[] {
  const { schedule } = event;
  const tz = schedule.timezone;
  const out: DayWindow[] = [];

  const openDay = (date: string): DayWindow => ({
    date,
    open: DEFAULT_OPEN,
    close: DEFAULT_CLOSE,
    hoursKnown: false,
    kind: "open",
  });

  const eachDate = (a: string, b: string, make: (d: string) => DayWindow) => {
    // Bounded so a malformed multi-year range cannot run away.
    const from = opts.from && opts.from > a ? opts.from : a;
    const to = opts.to && opts.to < b ? opts.to : b;
    const cap = opts.maxDays ?? DEFAULT_MAX_DAYS;
    for (let d = from, i = 0; d <= to && i < cap; d = addDays(d, 1), i++) out.push(make(d));
  };

  if (schedule.occurrences.length > 0) {
    for (const o of schedule.occurrences) {
      const s = toLocal(o.start, tz);
      if (s.time === null) {
        out.push({ ...openDay(s.date), occurrenceStart: o.start });
        continue;
      }
      const e = o.end ? toLocal(o.end, tz) : null;
      out.push({
        date: s.date,
        open: s.time,
        close: sessionClose(s.time, e, s.date),
        hoursKnown: true,
        kind: "session",
        occurrenceStart: o.start,
      });
    }
  } else {
    const s = toLocal(schedule.start, tz);
    const e = schedule.end ? toLocal(schedule.end, tz) : null;
    if (schedule.allDay || s.time === null) {
      eachDate(s.date, e && e.date >= s.date ? e.date : s.date, openDay);
    } else if (!e || e.date <= s.date) {
      out.push({
        date: s.date,
        open: s.time,
        close: sessionClose(s.time, e, s.date),
        hoursKnown: true,
        kind: "session",
      });
    } else if (e.time !== null && toMinutes(e.time) > toMinutes(s.time)) {
      const open = s.time;
      const close = e.time;
      eachDate(s.date, e.date, (date) => ({ date, open, close, hoursKnown: true, kind: "open" }));
    } else {
      out.push({ date: s.date, open: s.time, close: "23:59", hoursKnown: true, kind: "session" });
    }
  }

  return out
    .filter((w) => (!opts.from || w.date >= opts.from) && (!opts.to || w.date <= opts.to))
    .sort((a, b) => (a.date === b.date ? (a.open < b.open ? -1 : a.open > b.open ? 1 : 0) : a.date < b.date ? -1 : 1))
    .slice(0, opts.maxDays ?? DEFAULT_MAX_DAYS);
}

const ceilStep = (m: number) => Math.ceil(m / STEP) * STEP;
const floorStep = (m: number) => Math.floor(m / STEP) * STEP;

export function suggestVisit(window: DayWindow, prefs: VisitPrefs): VisitBlock {
  const open = toMinutes(window.open);
  const close = toMinutes(window.close);
  const whole: VisitBlock = { date: window.date, start: window.open, end: window.close, wholeWindow: true };
  if (close - open <= prefs.visitBlockMinutes + STEP) return whole;

  let lo = Math.max(open, toMinutes(prefs.visitEarliest));
  let hi = Math.min(close, toMinutes(prefs.visitLatestEnd));
  if (hi - lo < 60) {
    lo = open;
    hi = close;
  }
  const block = Math.min(prefs.visitBlockMinutes, hi - lo);

  const pt = prefs.preferredTimes ?? [];
  let start: number;
  if (pt.includes("afternoon") && !pt.includes("morning")) start = Math.max(lo, 14 * 60);
  else if (pt.length === 1 && pt[0] === "evening") start = hi - block;
  else start = lo;

  start = ceilStep(start);
  if (start + block > hi) {
    start = floorStep(hi - block);
    if (start < lo) start = lo;
  }
  return {
    date: window.date,
    start: fromMinutes(start),
    end: fromMinutes(start + block),
    wholeWindow: false,
  };
}

function build(date: string, start: number, end: number, open: number, close: number): VisitBlock {
  return {
    date,
    start: fromMinutes(start),
    end: fromMinutes(end),
    wholeWindow: start <= open && end >= close,
  };
}

export function shiftVisit(block: VisitBlock, window: DayWindow, deltaMinutes: number): VisitBlock {
  const open = toMinutes(window.open);
  const close = toMinutes(window.close);
  const len = Math.min(toMinutes(block.end) - toMinutes(block.start), close - open);
  const start = Math.max(open, Math.min(toMinutes(block.start) + deltaMinutes, close - len));
  return build(block.date, start, start + len, open, close);
}

export function resizeVisit(block: VisitBlock, window: DayWindow, minutes: number): VisitBlock {
  const open = toMinutes(window.open);
  const close = toMinutes(window.close);
  const len = Math.min(Math.max(STEP, Math.round(minutes / STEP) * STEP), close - open);
  let start = Math.min(toMinutes(block.start), close - len);
  start = Math.max(open, start);
  return build(block.date, start, start + len, open, close);
}

export function visitToPlan(block: VisitBlock): { start: string; end: string } {
  return { start: `${block.date}T${block.start}:00`, end: `${block.date}T${block.end}:00` };
}
