import { describe, expect, it } from "vitest";
import { SAMPLE_EVENT } from "@shared/events";
import { formatCost, formatWhen, groupForAgenda, statusBadge, CATEGORY_META } from "./events";
import { EVENT_CATEGORIES } from "@shared/events";

type Sched = typeof SAMPLE_EVENT.schedule;
const sched = (over: Partial<Sched>): Sched => ({
  timezone: "UTC",
  start: "2026-10-24T10:00:00Z",
  allDay: false,
  occurrences: [],
  ...over,
});
const item = (id: string, start: string, over: Partial<Sched> = {}) => ({
  id,
  event: { schedule: sched({ start, ...over }) },
});

describe("groupForAgenda", () => {
  const today = "2026-10-10";
  it("puts day 13 in next14 and day 14 in later", () => {
    const g = groupForAgenda(
      [item("d14", "2026-10-24T12:00:00Z"), item("d13", "2026-10-23T12:00:00Z"), item("d0", "2026-10-10T12:00:00Z")],
      today,
    );
    expect(g.next14.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-23"]);
    expect(g.later.map((i) => i.id)).toEqual(["d14"]);
  });

  it("groups same-day items and drops past events", () => {
    const g = groupForAgenda(
      [item("a", "2026-10-12T09:00:00Z"), item("b", "2026-10-12T15:00:00Z"), item("old", "2026-10-01T09:00:00Z")],
      today,
    );
    expect(g.next14).toHaveLength(1);
    expect(g.next14[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(g.later).toEqual([]);
  });

  it("uses the first upcoming occurrence and keeps running events on today", () => {
    const multi = item("m", "2026-10-01T10:00:00Z", {
      occurrences: [{ start: "2026-10-01T10:00:00Z" }, { start: "2026-10-30T10:00:00Z" }],
    });
    const running = item("r", "2026-10-08T10:00:00Z", { end: "2026-10-12T10:00:00Z" });
    const g = groupForAgenda([multi, running], today);
    expect(g.next14.map((d) => d.date)).toEqual(["2026-10-10"]);
    expect(g.later.map((i) => i.id)).toEqual(["m"]);
  });

  it("uses the event timezone for the day", () => {
    // 2026-10-23T20:00Z is already Oct 24 in Auckland (day 14).
    const g = groupForAgenda([item("nz", "2026-10-23T20:00:00Z", { timezone: "Pacific/Auckland" })], today);
    expect(g.later.map((i) => i.id)).toEqual(["nz"]);
  });
});

describe("formatWhen", () => {
  it("renders in the event timezone, not the machine's", () => {
    const s = sched({ timezone: "Pacific/Auckland", start: "2026-10-24T10:00:00Z", end: "2026-10-24T10:50:00Z" });
    // NZDT is UTC+13 in October: 10:00Z is 23:00 on Oct 24 in Auckland.
    expect(formatWhen(s, "24h")).toBe("Sat, Oct 24 · 23:00 – 23:50");
    // An end past local midnight spills onto the next day.
    expect(formatWhen({ ...s, end: "2026-10-24T12:30:00Z" }, "24h")).toBe("Sat, Oct 24 23:00 – Sun, Oct 25 01:30");
  });

  it("formats 12h and a same-day range", () => {
    const s = sched({ timezone: "America/Los_Angeles", start: "2026-10-24T10:00:00-07:00", end: "2026-10-24T16:00:00-07:00" });
    expect(formatWhen(s, "12h")).toBe("Sat, Oct 24 · 10:00 AM – 4:00 PM");
    expect(formatWhen(s, "24h")).toBe("Sat, Oct 24 · 10:00 – 16:00");
  });

  it("handles all-day, including date-only values", () => {
    expect(formatWhen(sched({ allDay: true, start: "2026-10-24" }), "24h")).toBe("Sat, Oct 24 · All day");
    expect(formatWhen(sched({ allDay: true, start: "2026-10-24", end: "2026-10-26" }), "24h")).toBe(
      "Sat, Oct 24 – Mon, Oct 26 · All day",
    );
  });

  it("appends +N more dates for multiple occurrences", () => {
    const s = sched({
      timezone: "America/Los_Angeles",
      start: "2026-10-24T10:00:00-07:00",
      occurrences: [
        { start: "2026-10-24T10:00:00-07:00" },
        { start: "2026-10-25T10:00:00-07:00" },
        { start: "2026-10-31T10:00:00-07:00" },
      ],
    });
    expect(formatWhen(s, "12h")).toBe("Sat, Oct 24 · 10:00 AM · +2 more dates");
    expect(formatWhen({ ...s, occurrences: s.occurrences.slice(0, 2) }, "12h")).toBe(
      "Sat, Oct 24 · 10:00 AM · +1 more date",
    );
  });
});

describe("formatCost", () => {
  const base = { isFree: false, ticketRequired: false, registrationRequired: false };
  it("covers free, text, range and from", () => {
    expect(formatCost({ ...base, isFree: true })).toBe("Free");
    expect(formatCost({ ...base, priceText: "Donation" })).toBe("Donation");
    expect(formatCost({ ...base, currency: "EUR", minPrice: 5 })).toBe("From €5");
    expect(formatCost({ ...base, currency: "USD", minPrice: 5, maxPrice: 12 })).toBe("$5 – $12");
    expect(formatCost({ ...base, currency: "USD", minPrice: 8, maxPrice: 8 })).toBe("$8");
    expect(formatCost({ ...base })).toBe("See details");
  });
});

describe("statusBadge", () => {
  it("flags cancelled and price changes", () => {
    expect(statusBadge("cancelled", [])).toEqual({ label: "Cancelled", tone: "clay" });
    expect(statusBadge("scheduled", [{ at: "2026-10-09T08:00:00Z", kind: "price-changed" }])).toEqual({
      label: "Price changed",
      tone: "sun",
    });
    expect(statusBadge("scheduled", [])).toBeNull();
    expect(
      statusBadge("scheduled", [
        { at: "2026-10-01T08:00:00Z", kind: "price-changed" },
        { at: "2026-10-02T08:00:00Z", kind: "reinstated" },
      ]),
    ).toBeNull();
  });
});

describe("CATEGORY_META", () => {
  it("covers every category", () => {
    for (const c of EVENT_CATEGORIES) expect(CATEGORY_META[c].label).not.toBe("");
  });
});
