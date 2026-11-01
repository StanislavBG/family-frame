import { beforeEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { queryKeys } from "@/lib/api";
import { DEFAULT_BROWSE, DEFAULT_FILTERS, type EventsBrowse } from "@/lib/events-filters";

// Server rendering always reads the hook's initial snapshot, so stand in a controllable value.
const stored = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/hooks/use-session-state", () => ({
  useSessionState: (_key: string, initial: unknown) => [stored.value ?? initial, () => {}],
}));

// Vitest's esbuild transform uses the classic JSX runtime, which needs a global React.
(globalThis as { React?: typeof React }).React = React;
vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
const { default: EventsPage } = await import("./events");

// A withdrawn item keeps the page on the Overview without needing a full event fixture.
const withdrawn = { eventId: "e1", withdrawn: true, response: "going", rec: {}, event: { category: "parks-outdoors" } };

function render(people: { id: string; name: string; birthday?: string }[]): string {
  const client = new QueryClient();
  client.setQueryData(queryKeys.events.status(), { sharingEnabled: true, counts: { new: 0, going: 0, changed: 0 } });
  client.setQueryData(queryKeys.events.items({}), [withdrawn]);
  client.setQueryData(queryKeys.events.items({ includeHidden: true }), [withdrawn]);
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
