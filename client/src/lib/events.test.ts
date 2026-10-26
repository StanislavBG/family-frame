import { describe, expect, it } from "vitest";
import { SAMPLE_EVENT } from "@shared/events";
import { eventDayEntries, monthCellItems, formatClock, formatClockRange, formatCost, formatWhen, agendaColumns, groupForAgenda, statusBadge, CATEGORY_META, isTripIdea, matchesTripFilter, isPaidOrTicketed, tripBadge } from "./events";
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

describe("agendaColumns", () => {
  const g = (date: string, n: number) => ({ date, items: Array.from({ length: n }, (_, i) => `${date}-${i}`) });
  const size = (col: { items: unknown[] }[]) => col.reduce((n, x) => n + x.items.length, 0);

  it("returns N empty columns for empty input", () => {
    expect(agendaColumns([], 3)).toEqual([[], [], []]);
  });

  it("keeps date order reading column by column", () => {
    const groups = ["01", "02", "03", "04", "05", "06", "07"].map((d, i) => g(`2026-10-${d}`, (i % 3) + 1));
    const flat = agendaColumns(groups, 3).flat().map((x) => x.date);
    expect(flat).toEqual(groups.map((x) => x.date));
  });

  it("balances within one day group of the smallest column", () => {
    const groups = [3, 1, 2, 2, 1, 3, 2, 1, 2].map((n, i) => g(`2026-10-${String(i + 1).padStart(2, "0")}`, n));
    const sizes = agendaColumns(groups, 3).map(size);
    const maxGroup = Math.max(...groups.map((x) => x.items.length));
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(maxGroup);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(17);
  });

  it("puts everything in one column when columns=1 (or < 1)", () => {
    const groups = [g("2026-10-01", 2), g("2026-10-02", 1)];
    expect(agendaColumns(groups, 1)).toEqual([groups]);
    expect(agendaColumns(groups, 0)).toEqual([groups]);
  });
});

describe("eventDayEntries", () => {
  const ev = (title: string, over: Partial<Sched>) => ({ event: { ...SAMPLE_EVENT, title, schedule: sched(over) } });

  it("lists a month-long event as open on a middle day", () => {
    const farm = ev("Farm", { start: "2026-10-01T09:00:00", end: "2026-10-31T18:00:00" });
    const r = eventDayEntries([farm], "2026-10-15");
    expect(r.sessions).toEqual([]);
    expect(r.open).toHaveLength(1);
    expect(r.open[0].window).toMatchObject({ open: "09:00", close: "18:00" });
  });

  it("places occurrence events in sessions only on occurrence dates", () => {
    const e = ev("Show", {
      start: "2026-10-10T10:00:00",
      occurrences: [{ start: "2026-10-10T10:00:00" }, { start: "2026-10-17T10:00:00" }],
    });
    expect(eventDayEntries([e], "2026-10-10").sessions).toHaveLength(1);
    expect(eventDayEntries([e], "2026-10-17").sessions).toHaveLength(1);
    expect(eventDayEntries([e], "2026-10-11").sessions).toHaveLength(0);
  });

  it("places a single-day event only on its date", () => {
    const e = ev("One", { start: "2026-10-12T10:00:00", end: "2026-10-12T12:00:00" });
    expect(eventDayEntries([e], "2026-10-12").sessions).toHaveLength(1);
    expect(eventDayEntries([e], "2026-10-13").sessions).toHaveLength(0);
    expect(eventDayEntries([e], "2026-10-11").sessions).toHaveLength(0);
  });

  it("sorts sessions by open time then title, open by title", () => {
    const items = [
      ev("Zed", { start: "2026-10-12T09:00:00", end: "2026-10-12T10:00:00" }),
      ev("Beta", { start: "2026-10-12T08:00:00", end: "2026-10-12T09:00:00" }),
      ev("Alpha", { start: "2026-10-12T09:00:00", end: "2026-10-12T10:00:00" }),
      ev("Yard", { start: "2026-10-01T09:00:00", end: "2026-10-31T18:00:00" }),
      ev("Barn", { start: "2026-10-01T09:00:00", end: "2026-10-31T18:00:00" }),
    ];
    const r = eventDayEntries(items, "2026-10-12");
    expect(r.sessions.map((e) => e.item.event.title)).toEqual(["Beta", "Alpha", "Zed"]);
    expect(r.open.map((e) => e.item.event.title)).toEqual(["Barn", "Yard"]);
  });
});

describe("formatClock", () => {
  it("formats 12h and 24h", () => {
    expect(formatClock("14:30")).toBe("2:30 PM");
    expect(formatClock("09:00")).toBe("9:00 AM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("14:30", "24h")).toBe("14:30");
    expect(formatClockRange("10:00", "12:30", "12h")).toBe("10:00 AM \u2013 12:30 PM");
  });
});

describe("trip helpers", () => {
  const trip = (type: "day-trip" | "weekend", driveMinutes: number, nights: number) =>
    ({ type, driveMinutes, nights }) as never;
  it("isTripIdea checks rec.trip", () => {
    expect(isTripIdea({ rec: { trip: trip("day-trip", 60, 0) } })).toBe(true);
    expect(isTripIdea({ rec: {} })).toBe(false);
  });
  it("matchesTripFilter close requires closeToHome === true", () => {
    expect(matchesTripFilter({ rec: {}, closeToHome: true }, "close")).toBe(true);
    expect(matchesTripFilter({ rec: {}, closeToHome: false }, "close")).toBe(false);
    expect(matchesTripFilter({ rec: {} }, "close")).toBe(false);
    expect(matchesTripFilter({ rec: {}, closeToHome: true }, "local")).toBe(true);
  });

  it("matchesTripFilter treats missing tripType as local", () => {
    expect(matchesTripFilter({ rec: {} }, "local")).toBe(true);
    expect(matchesTripFilter({ rec: {} }, "weekend")).toBe(false);
    expect(matchesTripFilter({ rec: { tripType: "weekend" } }, "weekend")).toBe(true);
    expect(matchesTripFilter({ rec: { tripType: "weekend" } }, "all")).toBe(true);
    expect(matchesTripFilter({ rec: { tripType: "day-trip" } }, "local")).toBe(false);
  });
  it("isPaidOrTicketed uses admission, else isFree", () => {
    const c = (isFree: boolean, admission?: string) => ({ event: { cost: { isFree, admission } } });
    expect(isPaidOrTicketed(c(false, "ticketed"))).toBe(true);
    expect(isPaidOrTicketed(c(false, "paid-entry"))).toBe(true);
    expect(isPaidOrTicketed(c(true, "free"))).toBe(false);
    expect(isPaidOrTicketed(c(false, "donation"))).toBe(false);
    expect(isPaidOrTicketed(c(false))).toBe(true);
    expect(isPaidOrTicketed(c(true))).toBe(false);
  });
  it("tripBadge formats type, nights and drive time", () => {
    expect(tripBadge({ rec: { trip: trip("day-trip", 45, 0) } })).toBe("Day trip \u00b7 about 45 min drive");
    expect(tripBadge({ rec: { trip: trip("day-trip", 75, 0) } })).toBe("Day trip \u00b7 about 1 h 15 min drive");
    expect(tripBadge({ rec: { trip: trip("weekend", 120, 1) } })).toBe("Weekend \u00b7 1 night \u00b7 about 2 h drive");
    expect(tripBadge({ rec: { trip: trip("weekend", 130, 2) } })).toBe("Weekend \u00b7 2 nights \u00b7 about 2 h 15 min drive");
    expect(tripBadge({ rec: { tripType: "day-trip", driveMinutes: 30 } })).toBe("Day trip \u00b7 about 30 min drive");
    expect(tripBadge({ rec: {} })).toBe("");
  });
});

describe("monthCellItems", () => {
  const e = (eventId: string) => ({ item: { eventId }, window: {} as never });
  it("lists sessions first then open items with allDay flags", () => {
    const out = monthCellItems({ sessions: [e("a"), e("b")], open: [e("c")] });
    expect(out.map((x) => x.item.eventId)).toEqual(["a", "b", "c"]);
    expect(out.map((x) => x.allDay)).toEqual([false, false, true]);
  });
  it("keeps each eventId once, first occurrence wins", () => {
    const out = monthCellItems({ sessions: [e("a"), e("a")], open: [e("a"), e("c")] });
    expect(out.map((x) => [x.item.eventId, x.allDay])).toEqual([["a", false], ["c", true]]);
  });
  it("returns [] for an empty day", () => {
    expect(monthCellItems({ sessions: [], open: [] })).toEqual([]);
  });
});
