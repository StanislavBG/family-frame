import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarEvent, Person } from "@shared/schema";

// Vitest's esbuild transform uses the classic JSX runtime, which needs a global React.
(globalThis as { React?: typeof React }).React = React;
const { CalendarDayView } = await import("./calendar-day-view");

const DAY = "2026-10-15";

function makeEvent(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    title: "Event",
    startDate: DAY,
    endDate: DAY,
    type: "shared",
    people: [],
    ...over,
  } as unknown as CalendarEvent;
}

const people = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
] as unknown as Person[];

function render(events: CalendarEvent[], todayIso = "2026-10-01", dayIso = DAY): string {
  return renderToStaticMarkup(
    React.createElement(CalendarDayView, {
      dayIso,
      todayIso,
      events,
      people,
      timeFormat: "24h",
      onNavigate: () => {},
      onBack: () => {},
      onSelectEvent: () => {},
      onCreateAt: () => {},
    }),
  );
}

describe("CalendarDayView", () => {
  it("renders the long date title and header controls", () => {
    const html = render([]);
    expect(html).toContain('data-testid="text-day-title"');
    expect(html).toContain("Thursday, October 15, 2026");
    for (const id of ["button-day-back", "button-prev-day", "button-next-day"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it("renders a timed event block with location and person names", () => {
    const html = render([
      makeEvent({ id: "t1", title: "Zoo trip", startTime: "10:00", endTime: "12:00", location: "City Zoo", people: ["p1", "p2"] }),
    ]);
    expect(html).toContain('data-testid="day-event-t1"');
    expect(html).toContain("City Zoo");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  it("renders an all-day event inside day-all-day", () => {
    const html = render([makeEvent({ id: "a1", title: "Holiday" })]);
    const start = html.indexOf('data-testid="day-all-day"');
    expect(start).toBeGreaterThan(-1);
    expect(html.slice(start)).toContain("Holiday");
    expect(html.indexOf("Holiday")).toBeGreaterThan(start);
  });

  it("renders slots 07 through 20 for an empty day and the empty-plan message", () => {
    const html = render([]);
    for (let h = 7; h <= 20; h++) {
      expect(html).toContain(`data-testid="day-slot-${String(h).padStart(2, "0")}"`);
    }
    expect(html).not.toContain('data-testid="day-slot-21"');
    expect(html).not.toContain('data-testid="day-all-day"');
    expect(html).toContain("Nothing planned yet - tap an hour to add an event");
  });

  it("strikes through a cancelled event", () => {
    const html = render([makeEvent({ id: "c1", title: "Called off", startTime: "09:00", cancelled: true })]);
    expect(html).toContain("line-through");
  });

  it("omits the Today button when viewing today and shows it otherwise", () => {
    expect(render([], DAY)).not.toContain("button-day-today");
    expect(render([], "2026-10-01")).toContain("button-day-today");
  });
});
