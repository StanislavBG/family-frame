import { describe, it, expect } from "vitest";
import { layoutDayTimeline, formatDurationMinutes, spanMinutes, pickCurrentDay, pickCurrentWeek, isCurrentWeek } from "./person-day";

const toddler = {
  start: "09:37",
  end: "16:21",
  spans: [{ start: "13:07", end: "14:20", label: "Nap" }],
  events: [
    { time: "15:00", kind: "meal", label: "Snack" },
    { time: "10:46", kind: "play", label: "Park" },
    { time: "12:37", kind: "meal", label: "Lunch" },
  ],
};

describe("layoutDayTimeline", () => {
  it("lays out the toddler fixture", () => {
    const l = layoutDayTimeline(toddler)!;
    expect(l.windowStart).toBe(540);
    expect(l.windowEnd).toBe(1020);
    expect(l.ticks).toHaveLength(9);
    expect(l.ticks.map((t) => t.label)).toEqual(["9 AM", "10", "11", "12 PM", "1", "2", "3", "4", "5"]);
    expect(l.band!.left).toBeCloseTo(7.7, 1);
    expect(l.band!.width).toBeCloseTo(84.2, 1);
    expect(l.spans[0].left).toBeCloseTo(51.46, 1);
    expect(l.spans[0].width).toBeCloseTo(15.2, 1);
    expect(l.spans[0]).toMatchObject({ label: "Nap", start: "13:07", end: "14:20" });
    expect(l.events.map((e) => e.time)).toEqual(["10:46", "12:37", "15:00"]);
    expect(l.events[0].left).toBeCloseTo(22.08, 1);
    expect(l.events[2].left).toBeCloseTo(75.0, 1);
  });

  it("returns null when there are no times", () => {
    expect(layoutDayTimeline(undefined)).toBeNull();
    expect(layoutDayTimeline({})).toBeNull();
    expect(layoutDayTimeline({ spans: [], events: [] })).toBeNull();
  });

  it("handles only events, widening to 4 hours", () => {
    const l = layoutDayTimeline({ events: [{ time: "10:30", kind: "k", label: "x" }] })!;
    expect(l.windowEnd - l.windowStart).toBe(240);
    expect(l.windowStart).toBeLessThanOrEqual(630);
    expect(l.windowEnd).toBeGreaterThanOrEqual(660);
    expect(l.band).toBeNull();
    expect(l.spans).toEqual([]);
    expect(l.events).toHaveLength(1);
  });

  it("widens a narrow window symmetrically", () => {
    const l = layoutDayTimeline({ start: "10:00", end: "12:00" })!;
    expect(l.windowStart).toBe(540);
    expect(l.windowEnd).toBe(780);
  });

  it("keeps the window inside the day", () => {
    const l = layoutDayTimeline({ start: "23:10", end: "23:50" })!;
    expect(l.windowEnd).toBe(1440);
    expect(l.windowEnd - l.windowStart).toBe(240);
  });

  it("clamps items outside an explicit window instead of dropping them", () => {
    const l = layoutDayTimeline({
      start: "09:00",
      end: "17:00",
      spans: [{ start: "08:00", end: "18:00", label: "Wide" }],
    })!;
    expect(l.spans).toHaveLength(1);
    expect(l.spans[0].left).toBeGreaterThanOrEqual(0);
    expect(l.spans[0].left + l.spans[0].width).toBeLessThanOrEqual(100.0001);
  });
});

describe("durations", () => {
  it("formats minutes", () => {
    expect(formatDurationMinutes(73)).toBe("1h 13m");
    expect(formatDurationMinutes(45)).toBe("45m");
    expect(formatDurationMinutes(120)).toBe("2h");
    expect(formatDurationMinutes(0)).toBe("0m");
  });
  it("computes span minutes", () => {
    expect(spanMinutes("13:07", "14:20")).toBe(73);
    expect(spanMinutes("14:20", "13:07")).toBe(0);
  });
});

describe("pickCurrentDay", () => {
  const days = ["2026-09-09", "2026-10-09", "2026-10-12"].map((date) => ({ date }));
  it("prefers today, else the newest past day", () => {
    expect(pickCurrentDay(days, "2026-10-09")?.date).toBe("2026-10-09");
    expect(pickCurrentDay(days, "2026-10-10")?.date).toBe("2026-10-09");
  });
  it("falls back to the soonest future day, and handles empty", () => {
    expect(pickCurrentDay(days, "2026-01-01")?.date).toBe("2026-09-09");
    expect(pickCurrentDay([], "2026-10-10")).toBeUndefined();
  });
});

describe("pickCurrentWeek", () => {
  const weeks = ["2026-10-19", "2026-10-05", "2026-10-12"].map((weekStart) => ({ weekStart }));
  it("picks the week containing today, not the newest", () => {
    expect(pickCurrentWeek(weeks, "2026-10-10")?.weekStart).toBe("2026-10-05");
    expect(pickCurrentWeek(weeks, "2026-10-12")?.weekStart).toBe("2026-10-12");
    expect(pickCurrentWeek(weeks, "2026-10-18")?.weekStart).toBe("2026-10-12");
  });
  it("falls back to the nearest past week, then the soonest future one", () => {
    expect(pickCurrentWeek(weeks, "2026-11-30")?.weekStart).toBe("2026-10-19");
    expect(pickCurrentWeek(weeks, "2026-09-01")?.weekStart).toBe("2026-10-05");
    expect(pickCurrentWeek([], "2026-10-10")).toBeUndefined();
  });
  it("isCurrentWeek covers seven days across a month boundary", () => {
    expect(isCurrentWeek("2026-09-28", "2026-10-04")).toBe(true);
    expect(isCurrentWeek("2026-09-28", "2026-10-05")).toBe(false);
  });
});
