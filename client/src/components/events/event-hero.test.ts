import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { queryKeys } from "@/lib/api";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import type { EventItem } from "@/lib/events";

(globalThis as { React?: typeof React }).React = React;
vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
const { EventHero } = await import("./event-hero");

const ID = "e1";
const TESTID = 'data-testid="link-event-registration"';

function render(event: FfEvent): string {
  const client = new QueryClient();
  const item = {
    eventId: ID,
    event,
    rec: { whyForHousehold: "Why", matchReasons: [], highlights: [], tips: [], confidence: 0.5 },
    response: { status: "none" },
    hasUnseenUpdate: false,
    withdrawn: false,
    recommendedAt: "2026-10-01T00:00:00Z",
  } as unknown as EventItem;
  client.setQueryData(queryKeys.events.item(ID), item);
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(Router, { ssrPath: "/" }, React.createElement(EventHero, { eventId: ID })),
    ),
  );
}

const base = (over: Partial<FfEvent>): FfEvent => ({
  ...SAMPLE_EVENT,
  cost: { ...SAMPLE_EVENT.cost, registrationRequired: false, registrationUrl: undefined },
  organizer: { name: "Org", url: "https://org.example/" },
  sources: [],
  ...over,
});

describe("EventHero Sign up pill", () => {
  it("shows Sign up with the organizer URL when registration is required", () => {
    const html = render(base({ cost: { ...SAMPLE_EVENT.cost, registrationRequired: true, registrationUrl: undefined } }));
    expect(html).toContain(TESTID);
    expect(html).toContain("Sign up");
    expect(html).not.toContain("Organizer website");
  });

  it("keeps Organizer website when its URL differs from the sign-up URL", () => {
    const html = render(
      base({ cost: { ...SAMPLE_EVENT.cost, registrationRequired: true, registrationUrl: "https://signup.example/" } }),
    );
    expect(html).toContain(TESTID);
    expect(html).toContain("https://signup.example/");
    expect(html).toContain("Organizer website");
  });

  it("shows no Sign up pill without a sign-up need", () => {
    const html = render(base({}));
    expect(html).not.toContain(TESTID);
    expect(html).toContain("Organizer website");
  });
});
