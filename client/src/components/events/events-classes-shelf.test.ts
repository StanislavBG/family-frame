import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import type { EventItem } from "@/lib/events";
import { EventsClassesShelf } from "./events-classes-shelf";

(globalThis as { React?: typeof React }).React = React;

function item(id: string, over: Partial<FfEvent> = {}, extra: Partial<EventItem> = {}): EventItem {
  return {
    eventId: id,
    event: { ...SAMPLE_EVENT, id, title: `Event ${id}`, ...over },
    rec: {} as EventItem["rec"],
    response: "none" as EventItem["response"],
    hasUnseenUpdate: false,
    withdrawn: false,
    recommendedAt: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

const kids = (id: string, over: Partial<FfEvent> = {}) =>
  item(id, { audience: { ageBands: ["toddler"] } as FfEvent["audience"], ...over });
const adults = (id: string, over: Partial<FfEvent> = {}) =>
  item(id, { audience: { ageBands: ["adult"] } as FfEvent["audience"], ...over });
const all = (id: string, over: Partial<FfEvent> = {}) =>
  item(id, { audience: { ageBands: ["all-ages"] } as FfEvent["audience"], ...over });

function render(items: EventItem[], limit?: number, onShowAll?: () => void): string {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      { ssrPath: "/" },
      React.createElement(EventsClassesShelf, { items, limit, onShowAll }),
    ),
  );
}

describe("EventsClassesShelf", () => {
  it("renders nothing for an empty list", () => {
    expect(render([])).toBe("");
  });

  it("groups by audience and hides empty groups", () => {
    const html = render([kids("k1"), adults("a1")]);
    expect(html).toContain("For the kids");
    expect(html).toContain("For grown-ups");
    expect(html).not.toContain("For all of us");
    expect(render([all("e1")])).toContain("For all of us");
  });

  it("uses recurrenceText, else formatWhen", () => {
    const withText = render([kids("k1")]);
    expect(withText).toContain("Saturdays and Sundays in October");
    const noText = render([
      kids("k2", { schedule: { ...SAMPLE_EVENT.schedule, recurrenceText: undefined } }),
    ]);
    expect(noText).not.toContain("Saturdays and Sundays");
    expect(noText).toContain("Oct");
  });

  it("links to the event page and shows Sign up only with a url", () => {
    const withUrl = render([
      kids("k1", { cost: { ...SAMPLE_EVENT.cost, registrationUrl: "https://riversidefarm.example/join" } }),
    ]);
    expect(withUrl).toContain('href="/k1"');
    expect(withUrl).toContain('href="https://riversidefarm.example/join"');
    expect(withUrl).toContain('target="_blank"');
    expect(withUrl).toContain('rel="noopener noreferrer"');
    const none = render([
      kids("k2", {
        cost: { ...SAMPLE_EVENT.cost, registrationUrl: undefined, registrationRequired: false },
      }),
    ]);
    expect(none).not.toContain("Sign up");
  });

  it("shows Close to home chip", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Router,
        { ssrPath: "/" },
        React.createElement(EventsClassesShelf, { items: [item("c1", {}, { closeToHome: true })] }),
      ),
    );
    expect(html).toContain("Close to home");
  });

  it("caps at limit and offers See all N", () => {
    const items = [kids("k1"), kids("k2"), kids("k3")];
    const html = render(items, 2, () => {});
    expect(html).toContain("See all 3");
    expect(html).not.toContain('href="/k3"');
    expect(render(items, 3, () => {})).not.toContain("See all");
  });
});
