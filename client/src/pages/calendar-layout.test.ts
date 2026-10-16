import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarEvent } from "@shared/schema";

function makeEvent(i: number): CalendarEvent {
  return {
    id: `e${i}`,
    title: `Event ${i}`,
    startDate: "2099-01-01",
    endDate: "2099-01-01",
    type: "shared",
    people: [],
  } as unknown as CalendarEvent;
}

// Vitest's esbuild transform uses the classic JSX runtime, which needs a global React.
(globalThis as { React?: typeof React }).React = React;
const { UpcomingEventsStrip } = await import("./calendar");

function render(events: CalendarEvent[]): string {
  return renderToStaticMarkup(
    React.createElement(UpcomingEventsStrip, {
      events,
      people: [],
      timeFormat: "24h",
      onSelect: () => {},
    }),
  );
}

describe("UpcomingEventsStrip", () => {
  it("renders 7 events in a single non-wrapping clipped row", () => {
    const html = render([1, 2, 3, 4, 5, 6, 7].map(makeEvent));
    for (let i = 1; i <= 7; i++) expect(html).toContain(`data-testid="upcoming-event-e${i}"`);
    expect(html).toContain("flex-nowrap");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("flex-wrap");
  });

  it("renders the empty state with no events", () => {
    expect(render([])).toContain("No upcoming events");
  });
});
