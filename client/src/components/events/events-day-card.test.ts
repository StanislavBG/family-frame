import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import { eventDayEntries, type DayEntry, type EventItem } from "@/lib/events";
import { EventsDayCard } from "./events-day-card";

(globalThis as { React?: typeof React }).React = React;

function item(id: string, over: Partial<FfEvent> = {}, extra: Partial<EventItem> = {}): EventItem {
  return {
    eventId: id,
    event: { ...SAMPLE_EVENT, id, title: `Event ${id}`, ...over },
    rec: { distanceKm: 2.5 } as EventItem["rec"],
    response: "none" as EventItem["response"],
    hasUnseenUpdate: false,
    withdrawn: false,
    recommendedAt: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

function render(it: EventItem, date: string, pick: "sessions" | "open"): string {
  const entry: DayEntry<EventItem> = eventDayEntries([it], date)[pick][0];
  expect(entry).toBeDefined();
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(Router, { ssrPath: "/" }, React.createElement(EventsDayCard, { entry })),
    ),
  );
}

const openSchedule = {
  timezone: "America/Los_Angeles",
  start: "2026-10-24",
  allDay: true,
  occurrences: [],
} as FfEvent["schedule"];

describe("EventsDayCard", () => {
  it("shows a session with its time, chips, cost, where and distance", () => {
    const html = render(item("s1", {}, { closeToHome: true }), "2026-10-24", "sessions");
    expect(html).toContain("10:00");
    expect(html).toContain('href="/s1"');
    expect(html).toContain("Pumpkin patch, hayrides");
    expect(html).toContain("Close to home");
    expect(html).toContain("Riverside Farm, Portland");
    expect(html).toContain("2.5 km");
    expect(html).toContain("Map");
    expect(html).not.toContain("Suggested visit");
    expect(html).toContain('aria-pressed="false"');
  });

  it("shows an open window with hours not listed and a suggested visit", () => {
    const html = render(item("o1", { schedule: openSchedule }), "2026-10-24", "open");
    expect(html).toContain("Hours not listed");
    expect(html).toContain("Suggested visit");
  });

  it("shows an ongoing class with recurrenceText and no suggested visit", () => {
    const schedule = { ...openSchedule, recurrenceText: "Tuesdays at 4 PM" };
    const cls = item("c1", {
      title: "Swim lessons",
      schedule,
      cost: { ...SAMPLE_EVENT.cost, registrationUrl: "https://riversidefarm.example/signup" },
    });
    const html = render(cls, "2026-10-24", "open");
    expect(html).toContain("Tuesdays at 4 PM");
    expect(html).not.toContain("Suggested visit");
    expect(html).toContain('href="https://riversidefarm.example/signup"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Sign up");
  });

  it("falls back to the class website text and omits Sign up without a link", () => {
    const cls = item("c2", {
      title: "Pottery class",
      schedule: openSchedule,
      organizer: undefined,
      sources: [],
      cost: { ...SAMPLE_EVENT.cost, registrationRequired: false, registrationUrl: undefined },
    });
    const html = render(cls, "2026-10-24", "open");
    expect(html).toContain("See the class website for times");
    expect(html).not.toContain("Sign up");
    expect(html).not.toContain("Suggested visit");
  });

  it("presses Interested when interested and disables it when going", () => {
    const pressed = render(item("i1", {}, { response: "interested" }), "2026-10-24", "sessions");
    expect(pressed).toContain('aria-pressed="true"');
    expect(pressed).not.toMatch(/<button[^>]*disabled/);
    const going = render(item("g1", {}, { response: "going" }), "2026-10-24", "sessions");
    expect(going).toMatch(/<button[^>]*disabled/);
  });
});
