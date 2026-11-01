import { describe, expect, it } from "vitest";
import { SAMPLE_EVENT } from "@shared/events";
import type { EventItem } from "./events";
import { dayCounts, dayStrip, dayViewSections, formatDayCount, parseDayParam } from "./events-day";

type Sched = typeof SAMPLE_EVENT.schedule;
const make = (id: string, title: string, over: Partial<Sched>, tags: string[] = []): EventItem =>
  ({
    eventId: id,
    event: {
      ...SAMPLE_EVENT,
      title,
      tags,
      schedule: { timezone: "UTC", start: "2026-10-24T10:00:00Z", allDay: false, occurrences: [], ...over },
    },
  }) as unknown as EventItem;
const at = (id: string, time: string, date = "2026-10-24") =>
  make(id, id, { start: `${date}T${time}:00Z`, end: `${date}T23:00:00Z` });
const keys = (items: EventItem[], d = "2026-10-24") => dayViewSections(items, d).map((s) => s.key);

describe("dayViewSections", () => {
  it("splits at 11:59, 12:00, 16:59 and 17:00", () => {
    const s = dayViewSections([at("a", "11:59"), at("b", "12:00"), at("c", "16:59"), at("d", "17:00")], "2026-10-24");
    expect(s.map((x) => [x.key, x.entries.map((e) => e.item.eventId)])).toEqual([
      ["morning", ["a"]],
      ["afternoon", ["b", "c"]],
      ["evening", ["d"]],
    ]);
  });

  it("is empty for an empty day", () => {
    expect(dayViewSections([], "2026-10-24")).toEqual([]);
    expect(keys([at("a", "09:00", "2026-10-25")])).toEqual([]);
  });

  it("sends ongoing classes to classes only, and a class with a session to its time", () => {
    const ongoing = make("o", "Pottery class", { start: "2026-10-01T00:00:00Z", end: "2026-12-01T00:00:00Z", allDay: true });
    const session = make("s", "Swim lesson", { start: "2026-10-24T09:00:00Z", end: "2026-10-24T10:00:00Z" });
    const all = dayViewSections([ongoing, session], "2026-10-24");
    expect(all.map((x) => x.key)).toEqual(["morning", "classes"]);
    expect(all[1].entries.map((e) => e.item.eventId)).toEqual(["o"]);
  });

  it("puts non-class open events under open all day", () => {
    const fair = make("f", "Farmers market", { start: "2026-10-24T00:00:00Z", end: "2026-10-24T23:59:00Z", allDay: true });
    expect(keys([fair])).toEqual(["open"]);
  });
});

describe("dayStrip", () => {
  const today = "2026-10-24";
  it("starts at today while selected is within today..today+6", () => {
    expect(dayStrip([], "2026-10-30", today).map((d) => d.iso)).toEqual([
      "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
    ]);
  });

  it("starts at selected outside that range", () => {
    expect(dayStrip([], "2026-10-31", today)[0].iso).toBe("2026-10-31");
    expect(dayStrip([], "2026-10-20", today)[0].iso).toBe("2026-10-20");
  });

  it("flags today and weekends and counts without ongoing classes", () => {
    const ongoing = make("o", "Pottery class", { start: "2026-10-01T00:00:00Z", end: "2026-12-01T00:00:00Z", allDay: true });
    const strip = dayStrip([at("a", "09:00"), at("b", "13:00"), ongoing], "2026-10-24", today);
    expect(strip[0]).toEqual({ iso: "2026-10-24", count: 2, isToday: true, isWeekend: true });
    expect(strip[1]).toMatchObject({ iso: "2026-10-25", count: 0, isToday: false, isWeekend: true });
    expect(strip[2].isWeekend).toBe(false);
  });
});

describe("parseDayParam", () => {
  it("accepts real dates only", () => {
    expect(parseDayParam("2026-10-24")).toBe("2026-10-24");
    expect(parseDayParam("2026-02-31")).toBeNull();
    expect(parseDayParam("2026-2-3")).toBeNull();
    expect(parseDayParam("nope")).toBeNull();
    expect(parseDayParam(undefined)).toBeNull();
  });
});

describe("dayCounts and formatDayCount", () => {
  const ongoing = (id: string) =>
    make(id, `${id} class`, { start: "2026-10-01T00:00:00Z", end: "2026-12-01T00:00:00Z", allDay: true });

  it("keeps ongoing classes out of events and matches the strip", () => {
    const items = [at("a", "09:00"), at("b", "13:00"), ongoing("c1"), ongoing("c2")];
    expect(dayCounts(items, "2026-10-24")).toEqual({ events: 2, classes: 2 });
    for (const d of dayStrip(items, "2026-10-24", "2026-10-24")) {
      expect(d.count).toBe(dayCounts(items, d.iso).events);
    }
  });

  it("counts a day with only classes", () => {
    expect(dayCounts([ongoing("c1"), ongoing("c2"), ongoing("c3")], "2026-10-24")).toEqual({ events: 0, classes: 3 });
  });

  it("formats counts", () => {
    expect(formatDayCount({ events: 18, classes: 8 })).toBe("18 events · 8 classes");
    expect(formatDayCount({ events: 1, classes: 0 })).toBe("1 event");
    expect(formatDayCount({ events: 1, classes: 1 })).toBe("1 event · 1 class");
    expect(formatDayCount({ events: 0, classes: 3 })).toBe("0 events · 3 classes");
  });
});
