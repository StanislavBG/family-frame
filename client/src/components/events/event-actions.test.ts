import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import type { DayWindow, VisitBlock } from "@shared/events-visit";
import { CLASS_NOTE, LENGTH_CHOICES, VisitEditor, WhoPicker } from "./event-actions";

(globalThis as { React?: typeof React }).React = React;

function render(people: { id: string; name: string }[], value: string[]): string {
  const client = new QueryClient();
  client.setQueryData(queryKeys.people(), people);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(WhoPicker, { value, onChange: () => {} })),
  );
}

describe("WhoPicker", () => {
  it("lists people as toggles, pressed from value", () => {
    const html = render([{ id: "p1", name: "Ana" }, { id: "p2", name: "Boris" }], ["p2"]);
    expect(html).toContain('data-testid="button-plan-person-p1"');
    expect(html).toContain('data-testid="button-plan-person-p2"');
    expect(html).toContain("Boris is going");
    expect(html).toContain("Ana is not going");
  });
  it("is hidden with no people", () => {
    expect(render([], [])).toBe("");
  });
});

describe("VisitEditor", () => {
  const windows: DayWindow[] = [{ date: "2026-11-07", open: "08:00", close: "20:00", hoursKnown: false, kind: "open" }];
  const block: VisitBlock = { date: "2026-11-07", start: "09:00", end: "11:00", wholeWindow: false };
  const html = (note?: string) =>
    renderToStaticMarkup(React.createElement(VisitEditor, { windows, block, onChange: () => {}, idPrefix: "plan", note }));
  it("shows the note instead of the hours line", () => {
    const out = html(CLASS_NOTE);
    expect(out).toContain("Pick the day of your first class. Times are on the class website.");
    expect(out).not.toContain("Hours not listed");
  });
  it("keeps the hours line without a note", () => {
    expect(html()).toContain("Hours not listed");
  });
  it("offers a 1 h length first", () => {
    expect(LENGTH_CHOICES[0]).toEqual({ minutes: 60, label: "1 h", aria: "Visit length 1 hour" });
    expect(html()).toContain("Visit length 1 hour");
  });
});
