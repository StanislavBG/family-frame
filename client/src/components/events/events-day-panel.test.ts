import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import type { EventItem } from "@/lib/events";
import { EventsDayPanel } from "./events-day-panel";

(globalThis as { React?: typeof React }).React = React;

function item(id: string, over: Partial<FfEvent> = {}): EventItem {
  return {
    eventId: id,
    event: { ...SAMPLE_EVENT, id, title: `Event ${id}`, ...over },
    rec: { distanceKm: 2.5 } as EventItem["rec"],
    response: "none" as EventItem["response"],
    hasUnseenUpdate: false,
    withdrawn: false,
    recommendedAt: "2026-10-01T00:00:00Z",
  };
}

const openSchedule = {
  timezone: "America/Los_Angeles",
  start: "2026-10-24",
  allDay: true,
  occurrences: [],
} as FfEvent["schedule"];

function render(items: EventItem[]): string {
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(
        Router,
        { ssrPath: "/" },
        React.createElement(EventsDayPanel, { items, dateIso: "2026-10-24", onDateChange: () => {} }),
      ),
    ),
  );
}

const cls = (over: Partial<FfEvent["schedule"]> = {}, url?: string) =>
  item("c1", {
    title: "Swim lessons",
    schedule: { ...openSchedule, ...over },
    cost: { ...SAMPLE_EVENT.cost, registrationUrl: url },
  });

describe("EventsDayPanel classes", () => {
  it("groups an ongoing class with its schedule, sign up link and no suggested visit", () => {
    const html = render([cls({ recurrenceText: "Tuesdays at 4 PM" }, "https://swim.example/signup")]);
    expect(html).toContain('data-testid="events-day-classes"');
    expect(html).toContain("Classes you can sign up for");
    expect(html).toContain("Tuesdays at 4 PM");
    expect(html).toContain('href="https://swim.example/signup"');
    expect(html).not.toContain("Suggested visit");
    expect(html).not.toContain("Hours not listed");
    expect(html).not.toContain("Open all day");
  });

  it("falls back to the class website text and omits Sign up without a url", () => {
    const html = render([cls()]);
    expect(html).toContain("See the class website for times");
    expect(html).not.toContain("Sign up</a>");
  });

  it("adds the class count to the count line and keeps other open rows", () => {
    const html = render([cls(), item("o1", { schedule: openSchedule })]);
    expect(html).toContain("1 event · 1 class");
    expect(html).toContain("Hours not listed");
    expect(html).toContain("Suggested visit");
    expect(render([item("o1", { schedule: openSchedule })])).toContain("1 event<");
  });

  it("counts a day with only classes as 0 events and keeps the empty message off", () => {
    const html = render([cls(), item("c2", { schedule: openSchedule, title: "Pottery class" })]);
    expect(html).toContain("0 events · 2 classes");
    expect(html).not.toContain("Nothing planned for this day.");
    expect(render([])).toContain("Nothing planned for this day.");
  });
});
