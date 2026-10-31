import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { queryKeys } from "@/lib/api";
import { toISODateString } from "@/lib/format";
import { mondayOfIso } from "@/lib/person-day";

// Vitest's esbuild transform uses the classic JSX runtime, which needs a global React.
(globalThis as { React?: typeof React }).React = React;
// useFitScale reads window.matchMedia during render.
vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
const { default: PeoplePage } = await import("./people");

const ID = "p1";
const today = toISODateString(new Date());
const week = { id: "w", data: { weekStart: mondayOfIso(today), title: "Week title", summary: "Week summary" } };
const day = { id: "d", data: { date: today, title: "Day title" } };
const list = <T,>(records: T[]) => ({ records, total: records.length });

function render(days: unknown[], weeks: unknown[]): string {
  const client = new QueryClient();
  client.setQueryData(["/api/people/list"], [{ id: ID, name: "Alice" }]);
  for (const limit of [1, 30]) client.setQueryData(queryKeys.data.personDays(ID, limit), list(days));
  // Limit 1 is the key the nav used to read, so this test fails if a week condition comes back.
  for (const limit of [1, 52]) client.setQueryData(queryKeys.data.personWeeks(ID, limit), list(weeks));
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(Router, { ssrPath: `/${ID}/dashboard` }, React.createElement(PeoplePage)),
    ),
  );
}

const has = (html: string, testId: string) => html.includes(`data-testid="${testId}"`);

describe("People nav Daily sheets", () => {
  it("hides Daily sheets for a week-only person but keeps the week card", () => {
    const html = render([], [week]);
    expect(has(html, "tab-person-sheets")).toBe(false);
    expect(has(html, "link-dashboard-sheets")).toBe(false);
    expect(has(html, "tab-person-dashboard")).toBe(true);
    expect(has(html, "dashboard-week-summary")).toBe(true);
    expect(html.includes("This week, in short")).toBe(true);
  });

  it("shows Daily sheets and the week card for a person with day and week records", () => {
    const html = render([day], [week]);
    expect(has(html, "tab-person-sheets")).toBe(true);
    expect(has(html, "dashboard-week-summary")).toBe(true);
  });

  it("shows Daily sheets for a day-only person", () => {
    expect(has(render([day], []), "tab-person-sheets")).toBe(true);
  });

  it("hides Daily sheets for a person with neither", () => {
    expect(has(render([], []), "tab-person-sheets")).toBe(false);
  });
});
