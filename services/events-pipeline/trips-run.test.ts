import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPreferencesSchema, type RecommendationInput } from "../../shared/events";
import { listPublishedForHousehold, openEventsDb, recordRecommendation, upsertHousehold } from "./db";
import type { EventsDb } from "./db";
import type { FfClient, FfHousehold, FfState } from "./ff-client";
import type { HaikuRunner } from "./haiku";
import { parseTripResult } from "./trips";
import { runTrips } from "./trips-run";

const tz = "America/Los_Angeles";
const now = new Date("2026-10-15T19:00:00Z"); // Thursday
const past = new Date("2026-10-08T19:00:00Z"); // its trip dates (Oct 10-11) are already over
const address = { line1: "1 Main St", city: "Portland", region: "OR", country: "United States", timezone: tz };
const home = { lat: 45.52, lon: -122.68, timezone: tz };

const base = {
  summary: "A fine trip.",
  description: "A fine trip with plenty to do.",
  category: "nature-animals",
  priceText: "$50",
  sources: ["https://example.com/x"],
  whyForHousehold: "Good for the family.",
};
const itinerary = [{ label: "Day 1", items: [{ time: "09:00", title: "Go", kind: "drive" }] }];
const lodging = [{ name: "Inn", area: "Town", priceText: "$150", url: "https://example.com/inn" }];

function raw(type: "day-trip" | "weekend", name: string) {
  return type === "weekend"
    ? {
        ...base,
        title: `${name} weekend`,
        destination: { name, city: "Hood River", country: "United States", lat: 45.7054, lon: -121.5215 },
        driveMinutesEstimate: 70,
        nights: 1,
        itinerary,
        lodging,
      }
    : {
        ...base,
        title: `${name} day trip`,
        destination: { name, city: "Troutdale", country: "United States", lat: 45.54, lon: -122.38 },
        driveMinutesEstimate: 30,
        nights: 0,
        itinerary,
        lodging: [],
      };
}

function trip(type: "day-trip" | "weekend", name: string, at: Date = now): RecommendationInput {
  const rec = parseTripResult(raw(type, name), { type, household: home, now: at });
  assert.ok(rec);
  return rec;
}

const hh = (prefs: object = {}): FfHousehold => ({
  householdId: "h1",
  address,
  timezone: tz,
  memberAges: [38, 36, 5],
  preferences: eventPreferencesSchema.parse(prefs),
  learned: {},
  lastPublishedAt: null,
  consentVersion: 1,
});

interface Ctx {
  db: EventsDb;
  puts: RecommendationInput[];
  prompts: string[];
  ff: Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations">;
  runner: HaikuRunner;
}

function setup(opts: { prefs?: object; responses?: Record<string, { response?: string; withdrawn?: boolean }>; next?: () => unknown }): Ctx {
  const db = openEventsDb(":memory:");
  upsertHousehold(db, { id: "h1", address, addressHash: "x", lat: 45.52, lon: -122.68, areaKey: "portland", profile: null, updatedAt: "t" });
  const puts: RecommendationInput[] = [];
  const prompts: string[] = [];
  const state = (): FfState => ({
    householdId: "h1",
    recommendations: Object.entries(opts.responses ?? {}).map(([eventId, r]) => ({
      eventId,
      fingerprint: "f",
      title: "t",
      start: "2026-10-10",
      category: "nature-animals",
      status: "scheduled",
      response: r.response ?? "none",
      feedback: null,
      calendarLinked: false,
      recommendedAt: "t",
      withdrawn: r.withdrawn ?? false,
    })),
    busy: [],
    feedback: [],
    preferences: eventPreferencesSchema.parse(opts.prefs ?? {}),
    learned: {},
  });
  return {
    db,
    puts,
    prompts,
    ff: {
      listHouseholds: async () => [hh(opts.prefs)],
      getState: async () => state(),
      putRecommendations: async (_id, body) => {
        puts.push(...body.recommendations);
        return { created: 0, updated: 0, unchanged: 0, ids: [], changed: [] };
      },
    },
    runner: {
      run: async (input) => {
        prompts.push(input.prompt);
        return opts.next ? { ok: true, data: opts.next() } : { ok: false, reason: "failed", detail: "none" };
      },
    },
  };
}

const publish = (c: Ctx, rec: RecommendationInput, at = past) =>
  recordRecommendation(c.db, { householdId: "h1", eventId: rec.event.id, publishedAt: at.toISOString(), publishedHash: "h", published: rec });

const run = (c: Ctx, dryRun = false) => runTrips({ db: c.db, ff: c.ff, runner: c.runner, now, runId: "r1", dryRun, onlyHouseholdId: "h1" });

test("empty pool: plans exactly one weekend trip first", async () => {
  const c = setup({ next: () => raw("weekend", "Hood River") });
  const s = await run(c);
  assert.equal(s.created, 1);
  assert.equal(c.prompts.length, 1);
  assert.match(c.prompts[0], /weekend trip/);
  assert.equal(c.puts.length, 1);
  assert.equal(c.puts[0].trip?.type, "weekend");
  assert.equal(listPublishedForHousehold(c.db, "h1").length, 1);
  assert.doesNotMatch(c.prompts[0], /1 Main St/);
});

test("weekend present, no day trip: plans a day trip", async () => {
  const c = setup({ next: () => raw("day-trip", "Troutdale") });
  publish(c, trip("weekend", "Hood River", now), now);
  const s = await run(c);
  assert.equal(s.created, 1);
  assert.match(c.prompts[0], /day trip/);
  assert.equal(c.puts[0].trip?.type, "day-trip");
  assert.equal(s.active, 2);
});

test("full pool plans nothing", async () => {
  const c = setup({ next: () => raw("weekend", "New") });
  publish(c, trip("weekend", "A", now), now);
  publish(c, trip("day-trip", "B", now), now);
  publish(c, trip("weekend", "C", now), now);
  const s = await run(c);
  assert.equal(s.created, 0);
  assert.equal(c.prompts.length, 0);
  assert.equal(s.active, 3);
});

test("tripsEnabled false: no planning", async () => {
  const c = setup({ prefs: { tripsEnabled: false }, next: () => raw("weekend", "Hood River") });
  const s = await run(c);
  assert.equal(s.created, 0);
  assert.equal(c.prompts.length, 0);
  assert.equal(c.puts.length, 0);
});

test("past-weekend trip is refreshed to the next dates without updates growth", async () => {
  const c = setup({});
  const old = trip("weekend", "Hood River", past);
  assert.equal(old.event.schedule.end, "2026-10-11");
  publish(c, old);
  publish(c, trip("day-trip", "B", now), now);
  publish(c, trip("weekend", "C", now), now);
  const s = await run(c);
  assert.equal(s.refreshed, 1);
  assert.equal(c.puts.length, 1);
  assert.equal(c.puts[0].event.id, old.event.id);
  assert.equal(c.puts[0].event.schedule.start, "2026-10-17");
  assert.equal(c.puts[0].event.schedule.end, "2026-10-18");
  assert.equal(c.puts[0].event.updates.length, old.event.updates.length);
  const stored = listPublishedForHousehold(c.db, "h1").find((r) => r.eventId === old.event.id);
  assert.equal(stored?.published?.event.schedule.start, "2026-10-17");
});

test("going + past trip is retired from the pool, not refreshed", async () => {
  const gone = trip("weekend", "Went", past);
  const c2 = setup({ responses: { [gone.event.id]: { response: "going" } }, next: () => raw("weekend", "Fresh") });
  publish(c2, gone);
  const s = await run(c2);
  assert.equal(s.retired, 1);
  assert.equal(s.refreshed, 0);
  assert.equal(s.created, 1);
  assert.equal(c2.puts.every((p) => p.event.id !== gone.event.id), true);
});

test("going trip with a future date is left alone", async () => {
  const future = trip("weekend", "Soon", now);
  const c = setup({ responses: { [future.event.id]: { response: "going" } }, next: () => raw("day-trip", "Troutdale") });
  publish(c, future, now);
  const s = await run(c);
  assert.equal(s.refreshed, 0);
  assert.equal(s.retired, 0);
  assert.equal(s.active, 2);
});

test("not-interested and withdrawn trips are never refreshed or counted", async () => {
  const a = trip("weekend", "No", past);
  const b = trip("day-trip", "Withdrawn", past);
  const c = setup({
    responses: { [a.event.id]: { response: "not-interested" }, [b.event.id]: { withdrawn: true } },
    next: () => raw("weekend", "Fresh"),
  });
  publish(c, a);
  publish(c, b);
  const s = await run(c);
  assert.equal(s.retired, 2);
  assert.equal(s.refreshed, 0);
  assert.equal(s.created, 1);
  assert.equal(s.active, 1);
  assert.equal(c.puts.some((p) => p.event.id === a.event.id || p.event.id === b.event.id), false);
});

test("dry-run publishes and plans nothing", async () => {
  const c = setup({ next: () => raw("weekend", "Hood River") });
  publish(c, trip("weekend", "Old", past));
  const s = await run(c, true);
  assert.equal(c.puts.length, 0);
  assert.equal(c.prompts.length, 0);
  assert.equal(s.created, 0);
  assert.equal(s.refreshed, 0);
});

test("planning failure is counted", async () => {
  const c = setup({});
  const s = await run(c);
  assert.equal(s.failed, 1);
  assert.equal(c.puts.length, 0);
});
