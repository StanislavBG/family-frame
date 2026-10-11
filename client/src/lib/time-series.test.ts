import { describe, it, expect } from "vitest";
import { timeSeriesKeys, seriesStats, monthlyBuckets, sparklinePath, formatSeriesValue, dueStatus } from "./time-series";

const p = (t: string, value: number) => ({ t, value });

describe("timeSeriesKeys", () => {
  it("all start with /api/metrics", () => {
    expect(timeSeriesKeys.list()[0]).toBe("/api/metrics");
    expect(timeSeriesKeys.list("util")[0]).toBe("/api/metrics");
    expect(timeSeriesKeys.points("a")[0]).toBe("/api/metrics");
    expect(timeSeriesKeys.tags()[0]).toBe("/api/metrics");
  });
});

describe("seriesStats", () => {
  it("empty input gives nulls", () => {
    expect(seriesStats([])).toEqual({
      count: 0, latest: null, previous: null, min: null, max: null, avg: null, median: null,
      sumLast12Months: null, changePct: null,
    });
  });

  it("single point", () => {
    const s = seriesStats([p("2026-01-15", 10)]);
    expect(s.count).toBe(1);
    expect(s.latest).toBe(10);
    expect(s.previous).toBeNull();
    expect(s.changePct).toBeNull();
    expect(s.median).toBe(10);
    expect(s.sumLast12Months).toBe(10);
  });

  it("flat series, unsorted mixed date/datetime input", () => {
    const s = seriesStats([p("2026-03-01T10:00:00Z", 5), p("2026-01-01", 5), p("2026-02-01", 5)]);
    expect(s.latest).toBe(5);
    expect(s.previous).toBe(5);
    expect(s.min).toBe(5);
    expect(s.max).toBe(5);
    expect(s.avg).toBe(5);
    expect(s.changePct).toBe(0);
  });

  it("changePct, median of even count, and null on zero previous", () => {
    const s = seriesStats([p("2026-01-01", 100), p("2026-02-01", 150), p("2026-03-01", 50), p("2026-04-01", 75)]);
    expect(s.latest).toBe(75);
    expect(s.previous).toBe(50);
    expect(s.changePct).toBe(50);
    expect(s.median).toBe(87.5);
    expect(seriesStats([p("2026-01-01", 0), p("2026-02-01", 4)]).changePct).toBeNull();
    expect(seriesStats([p("2026-01-01", -10), p("2026-02-01", -5)]).changePct).toBe(50);
  });

  it("sumLast12Months excludes points more than 365 days before the latest (13-month gap)", () => {
    const s = seriesStats([p("2024-12-01", 100), p("2025-01-01", 1), p("2026-01-01", 20)]);
    expect(s.sumLast12Months).toBe(21);
    const gap = seriesStats([p("2025-01-01", 100), p("2026-02-01", 7)]);
    expect(gap.sumLast12Months).toBe(7);
    expect(gap.count).toBe(2);
  });
});

describe("monthlyBuckets", () => {
  it("empty input gives empty list", () => {
    expect(monthlyBuckets([], 3)).toEqual([]);
  });

  it("single point fills trailing empty-free window", () => {
    expect(monthlyBuckets([p("2026-02-10", 4)], 2)).toEqual([
      { month: "2026-01", sum: null, count: 0 },
      { month: "2026-02", sum: 4, count: 1 },
    ]);
  });

  it("sums mixed date/datetime in the same month by the first 7 chars", () => {
    const b = monthlyBuckets([p("2026-03-31T23:30:00-08:00", 2), p("2026-03-01", 3), p("2026-02-15", 1)], 2);
    expect(b).toEqual([
      { month: "2026-02", sum: 1, count: 1 },
      { month: "2026-03", sum: 5, count: 2 },
    ]);
  });

  it("13-month gap yields empty buckets and crosses the year", () => {
    const b = monthlyBuckets([p("2025-01-05", 9), p("2026-02-05", 1)], 14);
    expect(b).toHaveLength(14);
    expect(b[0]).toEqual({ month: "2025-01", sum: 9, count: 1 });
    expect(b[1]).toEqual({ month: "2025-02", sum: null, count: 0 });
    expect(b[13]).toEqual({ month: "2026-02", sum: 1, count: 1 });
  });
});

describe("sparklinePath", () => {
  it("returns '' for fewer than 2 values", () => {
    expect(sparklinePath([], 100, 20)).toBe("");
    expect(sparklinePath([5], 100, 20)).toBe("");
    expect(sparklinePath([null, 5, null], 100, 20)).toBe("");
  });

  it("draws M…L… across the padded box", () => {
    expect(sparklinePath([0, 10], 100, 20, 2)).toBe("M2,18 L98,2");
  });

  it("keeps a flat series vertically centred", () => {
    expect(sparklinePath([3, 3, 3], 100, 20, 0)).toBe("M0,10 L50,10 L100,10");
  });

  it("skips nulls but keeps x positions", () => {
    expect(sparklinePath([0, null, 10], 100, 20, 0)).toBe("M0,20 L100,0");
  });
});

describe("formatSeriesValue", () => {
  it("formats ISO currency units", () => {
    expect(formatSeriesValue(1234.5, "USD")).toBe("$1,234.50");
    expect(formatSeriesValue(10, "EUR")).toContain("10.00");
    expect(formatSeriesValue(10, "BGN")).toContain("10.00");
  });

  it("formats other units as number plus unit", () => {
    expect(formatSeriesValue(412, "kWh")).toBe("412 kWh");
    expect(formatSeriesValue(1500.5, "m3")).toBe("1,500.5 m3");
  });

  it("handles missing unit", () => {
    expect(formatSeriesValue(7, null)).toBe("7");
    expect(formatSeriesValue(7, undefined)).toBe("7");
  });
});

describe("dueStatus", () => {
  it("classifies", () => {
    expect(dueStatus("2026-10-10", "2026-10-11")).toBe("overdue");
    expect(dueStatus("2026-10-11", "2026-10-11")).toBe("soon");
    expect(dueStatus("2026-10-18", "2026-10-11")).toBe("soon");
    expect(dueStatus("2026-10-19", "2026-10-11")).toBe("later");
  });

  it("returns null for missing or invalid dates", () => {
    expect(dueStatus(null, "2026-10-11")).toBeNull();
    expect(dueStatus(undefined, "2026-10-11")).toBeNull();
    expect(dueStatus("", "2026-10-11")).toBeNull();
    expect(dueStatus("soon", "2026-10-11")).toBeNull();
  });
});
