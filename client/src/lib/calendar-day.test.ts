import { describe, it, expect } from "vitest";
import type { CalendarEvent, Person } from "@shared/schema";
import { formatHourLabel, formatTimeOfDay, layoutCalendarDay } from "./calendar-day";

function ev(over: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: over.id,
    startDate: "2026-03-10",
    endDate: "2026-03-10",
    type: "shared",
    people: [],
    ...over,
  } as CalendarEvent;
}

const DAY = "2026-03-10";

describe("layoutCalendarDay selection", () => {
  it("puts untimed events in allDay sorted by title and ignores other days", () => {
    const layout = layoutCalendarDay(
      [
        ev({ id: "b", title: "Beta" }),
        ev({ id: "a", title: "Alpha" }),
        ev({ id: "x", title: "Other", startDate: "2026-03-11", endDate: "2026-03-11" }),
      ],
      [],
      DAY,
    );
    expect(layout.allDay.map((e) => e.title)).toEqual(["Alpha", "Beta"]);
    expect(layout.timed).toEqual([]);
  });

  it("puts the middle day of a multi-day timed event in allDay", () => {
    const e = ev({ id: "m", startDate: "2026-03-09", endDate: "2026-03-11", startTime: "10:00", endTime: "12:00" });
    const layout = layoutCalendarDay([e], [], DAY);
    expect(layout.allDay).toEqual([e]);
    expect(layout.timed).toEqual([]);
  });

  it("defaults a missing or non-later endTime to 60 minutes", () => {
    const layout = layoutCalendarDay(
      [
        ev({ id: "a", startTime: "09:00" }),
        ev({ id: "b", startTime: "11:00", endTime: "10:00" }),
        ev({ id: "c", startTime: "23:30" }),
      ],
      [],
      DAY,
    );
    expect(layout.timed.map((t) => [t.startMin, t.endMin])).toEqual([
      [540, 600],
      [660, 720],
      [1410, 1440],
    ]);
  });

  it("splits a multi-day timed event into first, middle and last day", () => {
    const e = ev({ id: "t", startDate: "2026-03-09", endDate: "2026-03-11", startTime: "20:00", endTime: "09:30" });
    const first = layoutCalendarDay([e], [], "2026-03-09");
    expect(first.timed[0]).toMatchObject({ startMin: 1200, endMin: 1440, continuesAfter: true, continuesBefore: false });
    const middle = layoutCalendarDay([e], [], "2026-03-10");
    expect(middle.allDay).toEqual([e]);
    const last = layoutCalendarDay([e], [], "2026-03-11");
    expect(last.timed[0]).toMatchObject({ startMin: 0, endMin: 570, continuesAfter: false, continuesBefore: true });
  });

  it("uses 0 to 60 on the last day when endTime is missing", () => {
    const e = ev({ id: "t", startDate: "2026-03-09", endDate: "2026-03-10", startTime: "20:00" });
    expect(layoutCalendarDay([e], [], DAY).timed[0]).toMatchObject({ startMin: 0, endMin: 60 });
  });
});

describe("layoutCalendarDay overlap", () => {
  it("shares columns for overlapping events and leaves touching ones alone", () => {
    const layout = layoutCalendarDay(
      [
        ev({ id: "a", startTime: "09:00", endTime: "10:00" }),
        ev({ id: "b", startTime: "09:30", endTime: "10:30" }),
        ev({ id: "c", startTime: "10:30", endTime: "11:00" }),
      ],
      [],
      DAY,
    );
    const by = Object.fromEntries(layout.timed.map((t) => [t.event.id, t]));
    expect([by.a.column, by.a.columns]).toEqual([0, 2]);
    expect([by.b.column, by.b.columns]).toEqual([1, 2]);
    expect([by.c.column, by.c.columns]).toEqual([0, 1]);
  });

  it("does not merge events that merely touch", () => {
    const layout = layoutCalendarDay(
      [
        ev({ id: "a", startTime: "09:00", endTime: "10:00" }),
        ev({ id: "b", startTime: "10:00", endTime: "11:00" }),
      ],
      [],
      DAY,
    );
    expect(layout.timed.map((t) => [t.column, t.columns])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });
});

describe("layoutCalendarDay hours and birthdays", () => {
  it("defaults to 7..21", () => {
    const layout = layoutCalendarDay([], [], DAY);
    expect([layout.startHour, layout.endHour]).toEqual([7, 21]);
  });

  it("widens the range for early and late events", () => {
    const early = layoutCalendarDay([ev({ id: "a", startTime: "05:30", endTime: "06:00" })], [], DAY);
    expect(early.startHour).toBe(5);
    const late = layoutCalendarDay([ev({ id: "b", startTime: "21:00", endTime: "22:15" })], [], DAY);
    expect(late.endHour).toBe(23);
  });

  it("matches birthdays by month and day", () => {
    const people: Person[] = [
      { id: "1", name: "Ann", birthday: "1990-03-10" },
      { id: "2", name: "Bob", birthday: "1990-03-11" },
      { id: "3", name: "Cy" },
    ];
    expect(layoutCalendarDay([], people, DAY).birthdays.map((p) => p.name)).toEqual(["Ann"]);
  });
});

describe("formatters", () => {
  it("formats times of day", () => {
    expect(formatTimeOfDay("16:30", "24h")).toBe("16:30");
    expect(formatTimeOfDay("16:30", "12h")).toBe("4:30 PM");
    expect(formatTimeOfDay("00:00", "12h")).toBe("12:00 AM");
    expect(formatTimeOfDay("12:05", "12h")).toBe("12:05 PM");
  });

  it("formats hour labels", () => {
    expect(formatHourLabel(7, "24h")).toBe("07:00");
    expect(formatHourLabel(7, "12h")).toBe("7 AM");
    expect(formatHourLabel(12, "12h")).toBe("12 PM");
    expect(formatHourLabel(0, "12h")).toBe("12 AM");
    expect(formatHourLabel(24, "12h")).toBe("12 AM");
    expect(formatHourLabel(15, "12h")).toBe("3 PM");
  });
});
