import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT, type FfEvent } from "../shared/events";
import {
  dayWindows,
  suggestVisit,
  shiftVisit,
  resizeVisit,
  visitToPlan,
  DEFAULT_VISIT_PREFS,
  type DayWindow,
  type VisitPrefs,
} from "../shared/events-visit";

function ev(schedule: Partial<FfEvent["schedule"]>): FfEvent {
  return {
    ...JSON.parse(JSON.stringify(SAMPLE_EVENT)),
    schedule: { timezone: "America/Los_Angeles", start: "2026-10-01T09:00:00", allDay: false, occurrences: [], ...schedule },
  };
}

const win = (open: string, close: string): DayWindow => ({
  date: "2026-10-05",
  open,
  close,
  hoursKnown: true,
  kind: "open",
});
const prefs = (p: Partial<VisitPrefs> = {}): VisitPrefs => ({ ...DEFAULT_VISIT_PREFS, ...p });
const span = (b: { start: string; end: string }) => `${b.start}-${b.end}`;

test("occurrences -> one session each", () => {
  const w = dayWindows(
    ev({
      occurrences: [
        { start: "2026-10-03T10:00:00", end: "2026-10-03T12:00:00" },
        { start: "2026-10-01T18:00:00", end: "2026-10-02T02:00:00" },
        { start: "2026-10-04T20:00:00" },
        { start: "2026-10-05" },
      ],
    }),
  );
  assert.deepEqual(w.map((x) => [x.date, x.open, x.close, x.kind, x.hoursKnown]), [
    ["2026-10-01", "18:00", "23:59", "session", true],
    ["2026-10-03", "10:00", "12:00", "session", true],
    ["2026-10-04", "20:00", "22:00", "session", true],
    ["2026-10-05", "09:00", "17:00", "open", false],
  ]);
  assert.equal(w[0].occurrenceStart, "2026-10-01T18:00:00");
});

test("missing end caps at 23:59", () => {
  const w = dayWindows(ev({ start: "2026-10-01T23:00:00" }));
  assert.equal(w[0].close, "23:59");
});

test("all-day -> open window per date", () => {
  const w = dayWindows(ev({ allDay: true, start: "2026-10-01", end: "2026-10-03" }));
  assert.equal(w.length, 3);
  assert.deepEqual([w[0].open, w[0].close, w[0].hoursKnown, w[0].kind], ["09:00", "17:00", false, "open"]);
  assert.equal(dayWindows(ev({ allDay: true, start: "2026-10-01" })).length, 1);
});

test("timed same-date -> session", () => {
  const w = dayWindows(ev({ start: "2026-10-01T10:00:00", end: "2026-10-01T13:00:00" }));
  assert.deepEqual(w.map((x) => [x.kind, x.open, x.close]), [["session", "10:00", "13:00"]]);
});

test("timed multi-date with daily hours; from/to and maxDays", () => {
  const e = ev({ start: "2026-10-01T09:00:00", end: "2026-10-31T18:00:00" });
  const all = dayWindows(e);
  assert.equal(all.length, 31);
  assert.deepEqual([all[0].kind, all[0].open, all[0].close, all[0].hoursKnown], ["open", "09:00", "18:00", true]);
  const some = dayWindows(e, { from: "2026-10-10", to: "2026-10-12" });
  assert.deepEqual(some.map((x) => x.date), ["2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.equal(dayWindows(e, { maxDays: 5 }).length, 5);
  const long = ev({ start: "2026-01-01T09:00:00", end: "2027-12-31T18:00:00" });
  assert.equal(dayWindows(long).length, 120);
});

test("overnight multi-date -> single session to 23:59", () => {
  const w = dayWindows(ev({ start: "2026-10-01T20:00:00", end: "2026-10-02T02:00:00" }));
  assert.deepEqual(w.map((x) => [x.date, x.kind, x.open, x.close]), [["2026-10-01", "session", "20:00", "23:59"]]);
});

test("timezone conversion, invalid tz falls back to UTC, offset-less literal", () => {
  const z = dayWindows(ev({ start: "2026-10-01T17:00:00Z", end: "2026-10-01T19:00:00Z" }));
  assert.deepEqual([z[0].date, z[0].open, z[0].close], ["2026-10-01", "10:00", "12:00"]);
  const off = dayWindows(ev({ start: "2026-10-02T03:30:00+02:00" }));
  assert.deepEqual([off[0].date, off[0].open], ["2026-10-01", "18:30"]);
  const bad = dayWindows(ev({ timezone: "Not/AZone", start: "2026-10-01T17:00:00Z", end: "2026-10-01T19:00:00Z" }));
  assert.equal(bad[0].open, "17:00");
  const lit = dayWindows(ev({ start: "2026-10-01T09:15:00" }));
  assert.equal(lit[0].open, "09:15");
});

test("suggestVisit cases", () => {
  const d = prefs();
  assert.equal(span(suggestVisit(win("09:00", "19:00"), d)), "10:00-12:30");
  assert.equal(span(suggestVisit(win("09:00", "16:00"), d)), "10:00-12:30");
  assert.equal(span(suggestVisit(win("11:00", "17:00"), d)), "11:00-13:30");
  const late = suggestVisit(win("18:00", "21:00"), d);
  assert.equal(span(late), "18:00-21:00");
  assert.equal(late.wholeWindow, true);
  assert.equal(span(suggestVisit(win("12:00", "18:00"), prefs({ preferredTimes: ["afternoon"] }))), "14:00-16:30");
  assert.equal(span(suggestVisit(win("09:00", "19:00"), prefs({ visitBlockMinutes: 120, visitEarliest: "10:30" }))), "10:30-12:30");
  assert.equal(suggestVisit(win("10:00", "11:30"), d).wholeWindow, true);
  assert.equal(span(suggestVisit(win("09:00", "19:00"), prefs({ preferredTimes: ["evening"] }))), "15:30-18:00");
  assert.equal(suggestVisit(win("09:00", "19:00"), d).wholeWindow, false);
});

test("shiftVisit stays inside the window", () => {
  const w = win("09:00", "16:00");
  const b = suggestVisit(w, prefs());
  assert.equal(span(shiftVisit(b, w, 30)), "10:30-13:00");
  assert.equal(span(shiftVisit(b, w, -120)), "09:00-11:30");
  assert.equal(span(shiftVisit(b, w, 600)), "13:30-16:00");
});

test("resizeVisit keeps bounds and positive length", () => {
  const w = win("09:00", "16:00");
  const b = suggestVisit(w, prefs());
  assert.equal(span(resizeVisit(b, w, 180)), "10:00-13:00");
  assert.equal(span(resizeVisit(b, w, 600)), "09:00-16:00");
  const r = resizeVisit({ ...b, start: "15:00", end: "16:00" }, w, 180);
  assert.equal(span(r), "13:00-16:00");
  const tiny = resizeVisit(b, w, 0);
  assert.ok(tiny.end > tiny.start);
  const short = win("10:00", "10:20");
  const s = resizeVisit({ date: short.date, start: "10:00", end: "10:20", wholeWindow: true }, short, 90);
  assert.ok(s.end > s.start && s.start >= "10:00" && s.end <= "10:20");
});

test("visitToPlan format", () => {
  assert.deepEqual(visitToPlan({ date: "2026-10-05", start: "10:00", end: "12:30", wholeWindow: false }), {
    start: "2026-10-05T10:00:00",
    end: "2026-10-05T12:30:00",
  });
});
