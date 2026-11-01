import { beforeEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { queryKeys } from "@/lib/api";
import { SAMPLE_EVENT } from "@shared/events";
import { DEFAULT_BROWSE, DEFAULT_FILTERS, type EventsBrowse } from "@/lib/events-filters";

// Server rendering always reads the hook's initial snapshot, so stand in a controllable value.
const stored = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/hooks/use-session-state", () => ({
  useSessionState: (_key: string, initial: unknown) => [stored.value ?? initial, () => {}],
}));

// Vitest's esbuild transform uses the classic JSX runtime, which needs a global React.
(globalThis as { React?: typeof React }).React = React;
vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
const { default: EventsPage, AgendaCard } = await import("./events");

// A withdrawn item keeps the page on the Overview without needing a full event fixture.
const withdrawn = { eventId: "e1", withdrawn: true, response: "going", rec: {}, event: { category: "parks-outdoors" } };

function render(
  people: { id: string; name: string; birthday?: string }[],
  opts: { items?: unknown[]; prefs?: unknown } = {},
): string {
  const client = new QueryClient();
  client.setQueryData(queryKeys.events.status(), { sharingEnabled: true, counts: { new: 0, going: 0, changed: 0 } });
  const list = opts.items ?? [withdrawn];
  client.setQueryData(queryKeys.events.items({}), list);
  client.setQueryData(queryKeys.events.items({ includeHidden: true }), list);
  if (opts.prefs) client.setQueryData(queryKeys.events.preferences(), opts.prefs);
  client.setQueryData(queryKeys.people(), people);
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(Router, { ssrPath: "/" }, React.createElement(EventsPage)),
    ),
  );
}

const has = (html: string, testId: string) => html.includes(`data-testid="${testId}"`);
const two = [
  { id: "a", name: "Ann", birthday: "1985-03-01" },
  { id: "b", name: "Ben", birthday: "2018-06-01" },
];

describe("Events page filters", () => {
  beforeEach(() => {
    stored.value = null;
  });

  it("renders the labelled groups, and Who with two birthdays", () => {
    const html = render(two);
    for (const g of ["response", "when", "kind", "distance", "cost", "category", "people"]) {
      expect(has(html, `events-filter-${g}`)).toBe(true);
    }
    for (const label of ["Show", "When", "What", "How far", "Cost", "Topic", "Who"]) {
      expect(html.includes(`aria-label="${label}"`)).toBe(true);
    }
    expect(html).toContain("under 45 minutes");
    expect(has(html, "events-view-agenda")).toBe(true);
    expect(has(html, "events-view-month")).toBe(true);
  });

  it("hides Who with fewer than two people who have a birthday", () => {
    expect(has(render([two[0], { id: "c", name: "Cy" }]), "events-filter-people")).toBe(false);
    expect(has(render([two[0]]), "events-filter-people")).toBe(false);
  });

  it("shows Clear filters only when a filter is on", () => {
    expect(has(render(two), "events-filter-clear")).toBe(false);
    stored.value = { ...DEFAULT_BROWSE, filters: { ...DEFAULT_FILTERS, cost: "free" } } satisfies EventsBrowse;
    expect(has(render(two), "events-filter-clear")).toBe(true);
  });
});

describe("Events page days", () => {
  beforeEach(() => {
    stored.value = null;
  });

  it("AgendaCard badge shows the group day, not the start", () => {
    const item = {
      eventId: "e2",
      response: "none",
      rec: {},
      event: {
        ...SAMPLE_EVENT,
        schedule: { ...SAMPLE_EVENT.schedule, timezone: "UTC", start: "2026-10-12T10:00:00Z", occurrences: [] },
      },
    } as never;
    const html = renderToStaticMarkup(
      React.createElement(Router, { ssrPath: "/" }, React.createElement(AgendaCard, { item, date: "2026-11-21" })),
    );
    expect(html).toContain('uppercase">Nov</span>');
    expect(html).toContain(">21</span>");
    expect(html).not.toContain('uppercase">Oct</span>');
  });

  it("renders Month view with a disallowed selected day", () => {
    stored.value = {
      ...DEFAULT_BROWSE,
      view: "month",
      selectedDate: "2026-10-12",
      month: "2026-10-01",
      filters: { ...DEFAULT_FILTERS, when: "weekends" },
    } satisfies EventsBrowse;
    const html = render(two);
    expect(has(html, "events-month")).toBe(true);
    expect(has(html, "events-month-cell-2026-10-12")).toBe(true);
  });
});

describe("Events page trip ideas and empty states", () => {
  const tripBrowse = (view: "month" | "agenda", kind: "day-trip" | "weekend" | "all") =>
    ({ ...DEFAULT_BROWSE, view, filters: { ...DEFAULT_FILTERS, kind } }) satisfies EventsBrowse;

  beforeEach(() => {
    stored.value = null;
  });

  it("Month with a trip chip and no ideas explains and hides the grid", () => {
    stored.value = tripBrowse("month", "day-trip");
    const html = render(two, { prefs: { tripsEnabled: true } });
    expect(has(html, "events-trips-none")).toBe(true);
    expect(html).toContain("No trip ideas yet. We research a new one each morning.");
    expect(has(html, "events-month")).toBe(false);
  });

  it("says trips are off, with a settings link, when tripsEnabled is false", () => {
    stored.value = tripBrowse("weekend", "weekend");
    const html = render(two, { prefs: { tripsEnabled: false } });
    expect(has(html, "events-trips-none")).toBe(true);
    expect(html).toContain("Trip ideas are off");
    expect(html).toContain("settings?section=apps&amp;app=events");
  });

  it("shows no trip message without a trip chip", () => {
    stored.value = { ...DEFAULT_BROWSE, view: "month" } satisfies EventsBrowse;
    expect(has(render(two), "events-trips-none")).toBe(false);
  });

  it("shows Clear filters when nothing matches, in both views", () => {
    for (const view of ["agenda", "month"] as const) {
      stored.value = { ...DEFAULT_BROWSE, view, filters: { ...DEFAULT_FILTERS, cost: "free" } };
      const html = render(two);
      expect(html).toContain("No events match these filters.");
      expect(has(html, "events-none-match-clear")).toBe(true);
    }
  });
});
