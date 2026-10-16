import { describe, expect, it } from "vitest";
import { SAMPLE_EVENT, type FfEvent } from "@shared/events";
import { buildEventFacts, distanceText, hasMapLocation, mapUrl, whereSummary } from "./event-detail";
import { formatCost, formatWhen } from "./events";

const rec = { distanceKm: 8.4, travelMinutes: 18 };

describe("buildEventFacts", () => {
  it("yields every row in order for a full event", () => {
    const event: FfEvent = {
      ...SAMPLE_EVENT,
      cost: { ...SAMPLE_EVENT.cost, ticketRequired: true, registrationRequired: true },
    };
    const facts = buildEventFacts(event, rec);
    expect(facts.map((f) => f.label)).toEqual([
      "When",
      "Where",
      "Distance",
      "Cost",
      "Tickets",
      "Ages",
      "Setting",
      "Strollers",
      "Accessibility",
      "Parking",
      "Organizer",
    ]);
    const byLabel = Object.fromEntries(facts.map((f) => [f.label, f.value]));
    expect(byLabel.When).toBe(formatWhen(event.schedule));
    expect(byLabel.Where).toBe("Riverside Farm · 1200 River Road");
    expect(byLabel.Distance).toBe("8.4 km away · 18 min");
    expect(byLabel.Cost).toBe(formatCost(event.cost));
    expect(byLabel.Tickets).toBe("Ticket required · Registration required");
    expect(byLabel.Setting).toBe("Outdoors");
    expect(byLabel.Organizer).toBe("Riverside Farm · hello@riversidefarm.example");
  });

  it("yields only applicable rows for a minimal online event", () => {
    const event: FfEvent = {
      ...SAMPLE_EVENT,
      location: { country: SAMPLE_EVENT.location.country, setting: "unknown", online: true },
      cost: { isFree: true, currency: "USD", ticketRequired: false, registrationRequired: false },
      audience: { ageBands: [], familyFriendly: true, strollerFriendly: false, languages: ["en"] },
      organizer: undefined,
    } as FfEvent;
    const facts = buildEventFacts(event, {});
    expect(facts).toEqual([
      { label: "When", value: formatWhen(event.schedule) },
      { label: "Where", value: "Online event" },
      { label: "Cost", value: "Free" },
    ]);
  });

  it("omits priceText from Cost when it equals formatCost output", () => {
    const cost = { ...SAMPLE_EVENT.cost, minPrice: undefined, maxPrice: undefined, priceText: "$10 per person" };
    const facts = buildEventFacts({ ...SAMPLE_EVENT, cost }, {});
    expect(facts.find((f) => f.label === "Cost")?.value).toBe("$10 per person");
  });
});

describe("helpers", () => {
  it("distanceText formats km and minutes", () => {
    expect(distanceText({ distanceKm: 12.6 })).toBe("13 km away");
    expect(distanceText({})).toBeNull();
  });
  it("whereSummary falls back to See map", () => {
    expect(whereSummary({ ...SAMPLE_EVENT.location, venueName: undefined, address: undefined, city: undefined, region: undefined })).toBe("See map");
  });
});

describe("mapUrl", () => {
  it("builds a Google Maps search URL from the place text", () => {
    const url = mapUrl(SAMPLE_EVENT.location);
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Riverside Farm"));
  });

  it("falls back to lat,lon when there is no place text", () => {
    const location = { setting: "unknown", online: false, lat: 45.5152, lon: -122.6784 } as FfEvent["location"];
    expect(mapUrl(location)).toBe("https://www.google.com/maps/search/?api=1&query=45.5152%2C-122.6784");
  });
});

describe("hasMapLocation", () => {
  it("is true for a place with a venue and address", () => {
    expect(hasMapLocation(SAMPLE_EVENT.location)).toBe(true);
  });

  it("is true for coordinates only", () => {
    expect(hasMapLocation({ setting: "unknown", online: false, lat: 1, lon: 2 } as FfEvent["location"])).toBe(true);
  });

  it("is false for an online event with no place or coordinates", () => {
    expect(hasMapLocation({ country: "US", setting: "unknown", online: true } as FfEvent["location"])).toBe(false);
  });
});
