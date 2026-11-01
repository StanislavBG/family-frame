import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import type { EventItem } from "@/lib/events";
import { EventsDayView } from "./events-day-view";

(globalThis as { React?: typeof React }).React = React;

function item(id: string, over: Partial<FfEvent> = {}): EventItem {
  return {
    eventId: id,
    event: { ...SAMPLE_EVENT, id, title: `Event ${id}`, ...over },
    rec: {} as EventItem["rec"],
    response: "none" as EventItem["response"],
    hasUnseenUpdate: false,
    withdrawn: false,
    recommendedAt: "2026-10-01T00:00:00Z",
  };
}

function render(
  items: EventItem[],
  dateIso: string,
  todayIso: string,
  extra: { trips?: EventItem[]; isDayShown?: (iso: string) => boolean } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(
        Router,
        { ssrPath: "/" },
        React.createElement(EventsDayView, {
          items,
          trips: extra.trips ?? [],
          dateIso,
          todayIso,
          isDayShown: extra.isDayShown,
          onDateChange: () => {},
        }),
      ),
    ),
  );
}

// 2026-10-24 is a Saturday, 2026-10-23 a Friday.
describe("EventsDayView", () => {
  it("shows title, count, strip and a section card", () => {
    const html = render([item("s1")], "2026-10-24", "2026-10-24");
    expect(html).toContain("Saturday, October 24");
    expect(html).toContain("1 event");
    expect(html).toContain('data-testid="events-day-strip-2026-10-24"');
    expect(html).toContain('data-testid="events-day-strip-2026-10-30"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("events-day-card-s1");
    expect(html).not.toContain("events-day-view-today");
  });

  it("offers Today when not on today", () => {
    expect(render([], "2026-10-25", "2026-10-24")).toContain("events-day-view-today");
  });

  it("lists trips on weekends only", () => {
    const trips = [item("t1", { title: "Coast trip" })];
    const sat = render([], "2026-10-24", "2026-10-23", { trips });
    expect(sat).toContain("Trip ideas for any weekend");
    expect(sat).toContain("Coast trip");
    expect(render([], "2026-10-23", "2026-10-23", { trips })).not.toContain("Trip ideas for any weekend");
  });

  it("says nothing is planned for an empty or disallowed day", () => {
    expect(render([], "2026-10-24", "2026-10-24")).toContain("Nothing planned for this day.");
    const html = render([item("s1")], "2026-10-24", "2026-10-24", { isDayShown: () => false });
    expect(html).toContain("Nothing planned for this day.");
    expect(html).not.toContain("events-day-card-s1");
  });
});
