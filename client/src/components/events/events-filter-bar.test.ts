import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventsFilterBar, type FilterGroup } from "./events-filter-bar";

(globalThis as { React?: typeof React }).React = React;

const noop = () => {};
const opts = [
  { id: "all", label: "All", count: 5 },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
];

function group(over: Partial<FilterGroup> = {}): FilterGroup {
  return { key: "cost", label: "Cost", options: opts, value: "all", defaultValue: "all", onSelect: noop, ...over };
}

function render(groups: FilterGroup[], activeCount = 0): string {
  return renderToStaticMarkup(
    React.createElement(EventsFilterBar, { groups, shown: 3, total: 9, activeCount, onClear: noop }),
  );
}

function chip(html: string, id: string): string {
  const m = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`));
  return m ? m[0] : "";
}

describe("EventsFilterBar", () => {
  it("renders a labelled group with testids and aria-pressed", () => {
    const html = render([group()]);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Cost"');
    expect(html).toContain('data-testid="events-filter-cost"');
    expect(chip(html, "events-filter-cost-all")).toContain('aria-pressed="true"');
    expect(chip(html, "events-filter-cost-free")).toContain('aria-pressed="false"');
  });

  it("tints a selected default and uses solid clay only for non-default", () => {
    const quiet = chip(render([group()]), "events-filter-cost-all");
    expect(quiet).toContain("bg-[#f7ddd0]");
    expect(quiet).not.toContain("bg-[#a83818]");
    const solid = chip(render([group({ value: "free" })]), "events-filter-cost-free");
    expect(solid).toContain("bg-[#a83818]");
    expect(solid).toContain("dark:bg-[#e07a52]");
  });

  it("shows counts and keeps min-h-11", () => {
    const html = render([group()]);
    expect(html).toContain("All (5)");
    expect(html).not.toContain("Free (");
    expect(chip(html, "events-filter-cost-free")).toContain("min-h-11");
  });

  it("collapsible group starts closed unless a non-default is selected", () => {
    const closed = render([group({ collapsible: true })]);
    expect(closed).toContain('data-testid="events-filter-cost-toggle"');
    expect(closed).not.toContain('data-testid="events-filter-cost-free"');
    const open = render([group({ collapsible: true, value: "paid" })]);
    expect(open).toContain('data-testid="events-filter-cost-free"');
    expect(chip(open, "events-filter-cost-toggle")).toContain("min-h-11");
    expect(open).toContain("<svg");
  });

  it("multi group accepts several selected ids", () => {
    const html = render([group({ multi: true, value: ["free", "paid"] })]);
    expect(chip(html, "events-filter-cost-free")).toContain('aria-pressed="true"');
    expect(chip(html, "events-filter-cost-paid")).toContain('aria-pressed="true"');
    expect(chip(html, "events-filter-cost-all")).toContain('aria-pressed="false"');
  });

  it("shows count and clear only when activeCount > 0", () => {
    const none = render([group()], 0);
    expect(none).not.toContain("shown");
    expect(none).not.toContain("events-filter-clear");
    const some = render([group()], 2);
    expect(some).toContain("3 of 9 shown");
    expect(some).toContain('data-testid="events-filter-clear"');
  });

  it("renders caption", () => {
    expect(render([group({ caption: "Hint text" })])).toContain("Hint text");
  });
});
