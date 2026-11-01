import { describe, expect, it } from "vitest";
import { SAMPLE_EVENT } from "@shared/events";
import {
  DEFAULT_BROWSE,
  DEFAULT_FILTERS,
  FILTER_LABELS,
  activeFilterCount,
  dayAllowed,
  kindCounts,
  matchesFilters,
  parseBrowse,
  topicOptions,
} from "./events-filters";
import type { EventItem } from "./events";

const TODAY = "2026-10-28"; // Wednesday
const ctx = { today: TODAY, ages: [] as number[] };

const mk = (id: string, over: { start?: string; event?: object; rec?: object; response?: string; closeToHome?: boolean } = {}): EventItem =>
  ({
    eventId: id,
    event: {
      ...SAMPLE_EVENT,
      schedule: { timezone: "UTC", start: over.start ?? "2026-10-28T10:00:00Z", allDay: false, occurrences: [] },
      title: "Story time",
      tags: [],
      cost: { isFree: false, ticketRequired: false, registrationRequired: false },
      audience: { ageBands: ["all-ages"] },
      category: "kids-activities",
      ...over.event,
    },
    rec: { ...(over.rec ?? {}) },
    response: over.response ?? "new",
    closeToHome: over.closeToHome,
    withdrawn: false,
  }) as unknown as EventItem;

describe("labels", () => {
  it("are exact", () => {
    const l = (k: keyof typeof FILTER_LABELS) => FILTER_LABELS[k].map((x) => x.label);
    expect(l("response")).toEqual(["All open", "New", "Interested", "Going", "Not for us"]);
    expect(l("when")).toEqual(["Any day", "This weekend", "Sat & Sun"]);
    expect(l("kind")).toEqual(["Everything", "Classes & sign-ups", "Day trips", "Weekend getaways"]);
    expect(l("distance")).toEqual(["Any distance", "Close to home", "Nearby"]);
    expect(l("cost")).toEqual(["Any price", "Free", "Paid / Ticketed"]);
  });
});

describe("dayAllowed", () => {
  it("Sat & Sun allows only weekend days", () => {
    const ok = dayAllowed("weekends", TODAY);
    expect(ok("2026-10-31")).toBe(true);
    expect(ok("2026-11-01")).toBe(true);
    expect(ok("2026-10-30")).toBe(false);
  });
  it("This weekend on a weekday is the coming Sat and Sun", () => {
    const ok = dayAllowed("this-weekend", TODAY);
    expect([ok("2026-10-30"), ok("2026-10-31"), ok("2026-11-01"), ok("2026-11-07")]).toEqual([false, true, true, false]);
  });
  it("This weekend on Saturday is today and Sunday", () => {
    const ok = dayAllowed("this-weekend", "2026-10-31");
    expect([ok("2026-10-30"), ok("2026-10-31"), ok("2026-11-01"), ok("2026-11-07")]).toEqual([false, true, true, false]);
  });
  it("This weekend on Sunday is today only", () => {
    const ok = dayAllowed("this-weekend", "2026-11-01");
    expect([ok("2026-10-31"), ok("2026-11-01"), ok("2026-11-07")]).toEqual([false, true, false]);
  });
});

describe("matchesFilters", () => {
  const f = (over: Partial<typeof DEFAULT_FILTERS>) => ({ ...DEFAULT_FILTERS, ...over });
  const sat = mk("sat", { start: "2026-10-31T10:00:00Z" });
  const wed = mk("wed");
  const trip = mk("trip", { rec: { trip: { type: "weekend" }, tripType: "weekend" } });
  const dayTrip = mk("dt", { rec: { trip: { type: "day-trip" }, tripType: "day-trip" } });

  it("Show", () => {
    expect(matchesFilters(mk("a", { response: "going" }), f({ response: "going" }), ctx)).toBe(true);
    expect(matchesFilters(mk("a", { response: "not-interested" }), f({}), ctx)).toBe(false);
    expect(matchesFilters(mk("a", { response: "dismissed" }), f({ response: "hidden" }), ctx)).toBe(true);
    expect(matchesFilters(mk("a", { response: "new" }), f({ response: "going" }), ctx)).toBe(false);
  });
  it("When uses day windows; trips pass", () => {
    expect(matchesFilters(sat, f({ when: "weekends" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ when: "weekends" }), ctx)).toBe(false);
    expect(matchesFilters(wed, f({ when: "this-weekend" }), ctx)).toBe(false);
    expect(matchesFilters(sat, f({ when: "this-weekend" }), ctx)).toBe(true);
    expect(matchesFilters(trip, f({ when: "this-weekend" }), ctx)).toBe(true);
    const multi = mk("m", { start: "2026-10-27T10:00:00Z", event: { schedule: { timezone: "UTC", start: "2026-10-27", end: "2026-11-02", allDay: true, occurrences: [] } } });
    expect(matchesFilters(multi, f({ when: "weekends" }), ctx)).toBe(true);
  });
  it("What", () => {
    const cls = mk("c", { event: { title: "Swim lessons" } });
    expect(matchesFilters(cls, f({ kind: "classes" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ kind: "classes" }), ctx)).toBe(false);
    expect(matchesFilters(trip, f({ kind: "weekend" }), ctx)).toBe(true);
    expect(matchesFilters(dayTrip, f({ kind: "weekend" }), ctx)).toBe(false);
    expect(matchesFilters(dayTrip, f({ kind: "day-trip" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ kind: "day-trip" }), ctx)).toBe(false);
  });
  it("How far", () => {
    expect(matchesFilters(mk("a", { closeToHome: true }), f({ distance: "close" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ distance: "close" }), ctx)).toBe(false);
    expect(matchesFilters(wed, f({ distance: "local" }), ctx)).toBe(true);
    expect(matchesFilters(mk("a", { rec: { tripType: "day-trip" } }), f({ distance: "local" }), ctx)).toBe(false);
  });
  it("Cost", () => {
    const free = mk("f", { event: { cost: { isFree: true, ticketRequired: false, registrationRequired: false } } });
    expect(matchesFilters(free, f({ cost: "free" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ cost: "free" }), ctx)).toBe(false);
    expect(matchesFilters(wed, f({ cost: "paid" }), ctx)).toBe(true);
    expect(matchesFilters(free, f({ cost: "paid" }), ctx)).toBe(false);
  });
  it("Who uses ages, and is ignored without ages", () => {
    const adults = mk("ad", { event: { audience: { ageBands: ["adult"] } } });
    expect(matchesFilters(adults, f({ people: ["kid"] }), { today: TODAY, ages: [4] })).toBe(false);
    expect(matchesFilters(wed, f({ people: ["kid"] }), { today: TODAY, ages: [4] })).toBe(true);
    expect(matchesFilters(adults, f({ people: ["x"] }), ctx)).toBe(true);
  });
  it("Topic", () => {
    expect(matchesFilters(wed, f({ category: "kids-activities" }), ctx)).toBe(true);
    expect(matchesFilters(wed, f({ category: "other" }), ctx)).toBe(false);
  });
});

describe("kindCounts / topicOptions / activeFilterCount", () => {
  it("counts upcoming items honouring other groups", () => {
    const items = [
      mk("c1", { event: { title: "Art class" } }),
      mk("c2", { event: { title: "Art class" }, response: "not-interested" }),
      mk("old", { start: "2026-01-01T10:00:00Z", event: { title: "Art class" } }),
      mk("dt", { rec: { trip: { type: "day-trip" }, tripType: "day-trip" } }),
      mk("wk", { rec: { trip: { type: "weekend" }, tripType: "weekend" } }),
    ];
    expect(kindCounts(items, DEFAULT_FILTERS, ctx)).toEqual({ classes: 1, "day-trip": 1, weekend: 1 });
    expect(kindCounts(items, { ...DEFAULT_FILTERS, response: "hidden" }, ctx)).toEqual({ classes: 1, "day-trip": 0, weekend: 0 });
  });
  it("orders topics with other last", () => {
    const items = [
      mk("a", { event: { category: "other" } }),
      mk("b", { event: { category: "museums-learning" } }),
      mk("c", { event: { category: "parks-outdoors" } }),
    ];
    expect(topicOptions(items)).toEqual(["parks-outdoors", "museums-learning", "other"]);
  });
  it("counts changed groups", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, when: "weekends", people: ["a", "b"] })).toBe(2);
  });
});

describe("parseBrowse", () => {
  it("returns defaults for junk", () => {
    expect(parseBrowse(null)).toEqual(DEFAULT_BROWSE);
    expect(parseBrowse("x")).toEqual(DEFAULT_BROWSE);
    expect(parseBrowse(42)).toEqual(DEFAULT_BROWSE);
  });
  it("rejects unknown values field by field and drops bad dates", () => {
    const b = parseBrowse({
      view: "month",
      filters: { response: "going", when: "nope", kind: 5, distance: "close", cost: {}, category: "zzz", people: ["a", 3, "a", ""] },
      selectedDate: "2026-02-31",
      month: "2026-10-01",
      lastDay: "tomorrow",
    });
    expect(b.view).toBe("month");
    expect(b.filters).toEqual({ ...DEFAULT_FILTERS, response: "going", distance: "close", people: ["a"] });
    expect(b.selectedDate).toBeNull();
    expect(b.month).toBe("2026-10-01");
    expect(b.lastDay).toBeNull();
  });
  it("keeps a valid category", () => {
    expect(parseBrowse({ filters: { category: "other" } }).filters.category).toBe("other");
    expect(parseBrowse({ filters: { category: "arts-culture" } }).filters.category).toBe("arts-culture");
  });
});
