import { describe, it, expect } from "vitest";
import {
  monthWindow, monthLabel, stackMonths, yearlyTotal, averageMonth, breakdown, setAsideNote, niceAxis, monthValues,
} from "./bills-chart";
import type { StackInput } from "./bills-chart";

const TODAY = "2026-10-11";
const p = (t: string, value: number) => ({ t, value });
const input = (id: string, what: string, points: Array<{ t: string; value: number }>, setAside = false): StackInput => ({
  id, what, color: `#${id}`, points, setAside,
});

describe("monthWindow", () => {
  it("returns 13 months ending at today's month", () => {
    const w = monthWindow(TODAY, 13);
    expect(w).toHaveLength(13);
    expect(w[0]).toBe("2025-10");
    expect(w[12]).toBe("2026-10");
    expect(w[3]).toBe("2026-01");
  });
  it("defaults to 13 and handles January", () => {
    const w = monthWindow("2026-01-05");
    expect(w).toHaveLength(13);
    expect(w[0]).toBe("2025-01");
    expect(w[12]).toBe("2026-01");
  });
});

describe("monthLabel", () => {
  it("splits month and year", () => {
    expect(monthLabel("2025-10")).toEqual({ mon: "Oct", year: "2025" });
    expect(monthLabel("2026-01")).toEqual({ mon: "Jan", year: "2026" });
  });
});

describe("stackMonths", () => {
  const months = monthWindow(TODAY);
  it("sums per month, keeps input order, omits zeros and setAside", () => {
    const inputs = [
      input("a", "Gas", [p("2026-09-03", 10), p("2026-09-20T10:00:00Z", 5), p("2026-08-01", 7)]),
      input("b", "Water", [p("2026-09-10", 20)]),
      input("tax", "Property tax", [p("2026-09-10", 1000)], true),
    ];
    const r = stackMonths(inputs, months);
    expect(r).toHaveLength(13);
    const sep = r.find((x) => x.month === "2026-09")!;
    expect(sep.total).toBe(35);
    expect(sep.segments).toEqual([
      { id: "a", color: "#a", value: 15 },
      { id: "b", color: "#b", value: 20 },
    ]);
    const aug = r.find((x) => x.month === "2026-08")!;
    expect(aug.segments).toEqual([{ id: "a", color: "#a", value: 7 }]);
    expect(r[12]).toEqual({ month: "2026-10", total: 0, segments: [] });
  });
  it("ignores points outside the window and handles empty inputs", () => {
    const r = stackMonths([input("a", "Gas", [p("2020-01-01", 99)])], months);
    expect(r.every((x) => x.total === 0 && x.segments.length === 0)).toBe(true);
    expect(stackMonths([], months)).toHaveLength(13);
    expect(stackMonths([], [])).toEqual([]);
  });
});

describe("yearlyTotal", () => {
  it("covers (today - 365 days, today]", () => {
    const pts = [p("2025-10-11", 100), p("2025-10-12", 1), p("2026-10-11", 2), p("2026-10-12", 50)];
    expect(yearlyTotal(pts, TODAY)).toBe(3);
    expect(yearlyTotal([], TODAY)).toBe(0);
  });
});

describe("worked example", () => {
  const month = (m: string) => `${m}-05`;
  const spread = (total: number, id: string, what: string, setAside = false) =>
    input(id, what, [p(month("2025-11"), total / 2), p(month("2026-09"), total / 2)], setAside);
  const inputs = [
    spread(979.68, "e", "Electricity"),
    spread(2062.26, "g", "Gas"),
    spread(785.97, "w", "Water"),
    spread(960, "i", "Internet"),
    spread(620.04, "m", "Mobile"),
    spread(776.88, "t", "Trash"),
    spread(15348.79, "tax", "Property Tax", true),
  ];
  it("yearlyTotal of gas", () => {
    expect(yearlyTotal(inputs[1].points, TODAY)).toBeCloseTo(2062.26, 2);
  });
  it("averageMonth excludes setAside", () => {
    expect(averageMonth(inputs, TODAY)).toBeCloseTo(515.4, 2);
  });
  it("setAsideNote", () => {
    const n = setAsideNote(inputs, TODAY)!;
    expect(n.label).toBe("property tax");
    expect(n.monthly).toBeCloseTo(1279.07, 2);
    expect(n.total).toBeCloseTo(1794.47, 2);
  });
  it("setAsideNote joins labels and is null without setAside inputs", () => {
    const two = [input("a", "Property Tax", [], true), input("b", "Insurance", [], true)];
    expect(setAsideNote(two, TODAY)!.label).toBe("property tax and insurance");
    expect(setAsideNote(inputs.slice(0, 6), TODAY)).toBeNull();
    expect(setAsideNote([], TODAY)).toBeNull();
  });
  it("averageMonth of nothing is 0", () => {
    expect(averageMonth([], TODAY)).toBe(0);
  });
});

describe("breakdown", () => {
  const months = monthWindow(TODAY);
  const inputs = [
    input("a", "Gas", [p("2026-09-03", 60), p("2026-08-03", 60)]),
    input("b", "Water", [p("2026-09-10", 120)]),
    input("tax", "Tax", [p("2026-09-10", 9999)], true),
  ];
  it("uses yearly total / 12 when nothing is selected", () => {
    const r = breakdown(inputs, months, null, TODAY);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[0].value).toBeCloseTo(10, 5);
    expect(r[1].value).toBeCloseTo(10, 5);
    expect(r[0].pct).toBeCloseTo(100, 5);
  });
  it("uses the selected month's sum, sorted desc, pct relative to largest", () => {
    const r = breakdown(inputs, months, months.indexOf("2026-09"), TODAY);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r[0]).toMatchObject({ value: 120, pct: 100 });
    expect(r[1]).toMatchObject({ value: 60, pct: 50 });
  });
  it("gives pct 0 and no NaN when every value is 0", () => {
    const r = breakdown(inputs, months, months.indexOf("2026-10"), TODAY);
    expect(r.every((x) => x.value === 0 && x.pct === 0)).toBe(true);
    expect(breakdown([], months, null, TODAY)).toEqual([]);
  });
});

describe("niceAxis", () => {
  const STEPS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  it("zero gives the smallest step", () => {
    expect(niceAxis(0)).toEqual({ max: 25, step: 25 });
  });
  it("max is a multiple of step, >= input, at most 6 gridlines", () => {
    for (const v of [1, 24, 25, 26, 140, 150, 151, 600, 999, 1250, 1794.47, 3000, 7000, 20000]) {
      const { max, step } = niceAxis(v);
      expect(STEPS).toContain(step);
      expect(max % step).toBe(0);
      expect(max).toBeGreaterThanOrEqual(v);
      expect(max / step).toBeLessThanOrEqual(6);
    }
  });
  it("picks the smallest fitting step", () => {
    expect(niceAxis(150)).toEqual({ max: 150, step: 25 });
    expect(niceAxis(600)).toEqual({ max: 600, step: 100 });
  });
});

describe("monthValues", () => {
  const months = monthWindow(TODAY);
  it("sums per month with null for gaps, ignoring out-of-window points", () => {
    const r = monthValues([p("2026-09-01", 5), p("2026-09-15T08:00:00Z", 6), p("2026-07-01", 3), p("2019-01-01", 99)], months);
    expect(r).toHaveLength(13);
    expect(r[months.indexOf("2026-09")]).toBe(11);
    expect(r[months.indexOf("2026-07")]).toBe(3);
    expect(r[months.indexOf("2026-08")]).toBeNull();
    expect(r.filter((x) => x !== null)).toHaveLength(2);
  });
  it("empty points give all null", () => {
    expect(monthValues([], months).every((x) => x === null)).toBe(true);
  });
});
