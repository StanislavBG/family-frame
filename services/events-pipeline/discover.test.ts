import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPreferencesSchema, type RecommendationInput } from "../../shared/events";
import { listHouseholds, listRecommendationsForHousehold, openEventsDb, upsertHousehold, recordRecommendation } from "./db";
import { runDiscover } from "./discover";
import type { FfClient, FfHousehold, FfState } from "./ff-client";
import type { HaikuResult, HaikuRunner } from "./haiku";
import { areaKey } from "./geo";

const now = new Date("2026-10-10T12:00:00Z");
const address = { line1: "1 Main St", city: "Portland", region: "OR", country: "United States", timezone: "America/Los_Angeles" };

const candidate = {
  title: "Riverside Family Pumpkin Festival",
  description: "Pumpkin patch, hayrides and a costume parade.",
  start: "2026-10-17T10:00:00-07:00",
  city: "Portland",
  country: "United States",
  category: "kids-activities",
  sourceUrls: ["https://riversidefarm.example/festival"],
};

function household(id: string): FfHousehold {
  return {
    householdId: id,
    address,
    timezone: "America/Los_Angeles",
    memberAges: [38, 36, 5],
    preferences: eventPreferencesSchema.parse({}),
    learned: {},
    lastPublishedAt: null,
    consentVersion: 1,
  };
}

function state(id: string, over: Partial<FfState> = {}): FfState {
  return { householdId: id, recommendations: [], busy: [], feedback: [], preferences: eventPreferencesSchema.parse({}), learned: {}, ...over };
}

interface Fake {
  ff: Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations" | "recordRun">;
  calls: string[];
  puts: RecommendationInput[];
}

function fakeFf(households: FfHousehold[], states: Record<string, FfState>, calls: string[] = []): Fake {
  const puts: RecommendationInput[] = [];
  return {
    calls,
    puts,
    ff: {
      listHouseholds: async () => households,
      getState: async (id) => {
        calls.push(`state:${id}`);
        return states[id] ?? state(id);
      },
      putRecommendations: async (id, body) => {
        calls.push(`put:${id}`);
        puts.push(...body.recommendations);
        return { created: body.recommendations.length, updated: 0, unchanged: 0, ids: [], changed: [] };
      },
      recordRun: async () => {
        calls.push("recordRun");
        return { lastRunId: "r", lastPublishedAt: now.toISOString(), lastRun: null };
      },
    },
  };
}

function fakeRunner(searchResult: () => HaikuResult, calls: string[] = []): HaikuRunner {
  return {
    run: async (input) => {
      if (input.prompt.startsWith("Find real")) {
        calls.push("search");
        return searchResult();
      }
      return { ok: false, reason: "failed", detail: "no explain in tests" };
    },
  };
}

const found = (...c: unknown[]) => (): HaikuResult => ({ ok: true, data: { candidates: c } });
const geocoder = { geocode: async () => ({ lat: 45.5, lon: -122.6 }) };
const limits = { maxTasksPerArea: 1 };

function run(over: Partial<Parameters<typeof runDiscover>[0]> & Pick<Parameters<typeof runDiscover>[0], "ff" | "runner">) {
  return runDiscover({ db: openEventsDb(":memory:"), geocoder, now, runId: "run1", limits, ...over });
}

test("revoked household is purged with its recommendations", async () => {
  const db = openEventsDb(":memory:");
  upsertHousehold(db, { id: "gone", address, addressHash: "x", lat: 1, lon: 2, areaKey: areaKey(address), profile: null, updatedAt: "t" });
  recordRecommendation(db, { householdId: "gone", eventId: "e1", publishedAt: "t", publishedHash: "h" });
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found()) });
  assert.equal(stats.purged, 1);
  assert.deepEqual(listHouseholds(db).map((h) => h.id), ["h1"]);
  assert.equal(listRecommendationsForHousehold(db, "gone").length, 0);
});

test("state is read before any search", async () => {
  const calls: string[] = [];
  const f = fakeFf([household("h1")], {}, calls);
  await run({ ff: f.ff, runner: fakeRunner(found(candidate), calls) });
  assert.ok(calls.indexOf("state:h1") >= 0 && calls.indexOf("state:h1") < calls.indexOf("search"), calls.join(","));
});

test("new candidate is published and recorded locally", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.newEvents, 1);
  assert.equal(stats.published, 1);
  assert.equal(f.puts.length, 1);
  assert.equal(listRecommendationsForHousehold(db, "h1").length, 1);
});

test("duplicate candidate is merged and not re-published", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const runner = fakeRunner(found(candidate, { ...candidate, title: "Riverside Family Pumpkin Festival!", sourceUrls: ["https://other.example/p"] }));
  const first = await runDiscover({ db, geocoder, now, runId: "r1", limits, ff: f.ff, runner });
  assert.equal(first.newEvents, 1);
  assert.equal(first.merged, 1);
  assert.equal(first.published, 1);
  const second = await runDiscover({ db, geocoder, now, runId: "r2", limits: { ...limits, maxTasksPerArea: 3 }, ff: f.ff, runner });
  assert.equal(second.newEvents, 0);
  assert.equal(second.published, 0);
  assert.equal(f.puts.length, 1);
});

test("event clashing with a busy interval is skipped", async () => {
  const busy = [{ start: "2026-10-17T09:00:00-07:00", end: "2026-10-17T14:00:00-07:00" }];
  const f = fakeFf([household("h1")], { h1: state("h1", { busy }) });
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.published, 0);
  assert.ok(stats.skipped >= 1);
  assert.equal(f.puts.length, 0);
});

test("dryRun makes no ff writes", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, geocoder, now, runId: "r", limits, dryRun: true, ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.published, 1);
  assert.equal(f.calls.some((c) => c.startsWith("put:") || c === "recordRun"), false);
  assert.equal(listRecommendationsForHousehold(db, "h1").length, 0);
});

test("rate limit stops searching but still publishes from the repository", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  await runDiscover({ db, geocoder, now, runId: "r1", limits, dryRun: true, ff: f.ff, runner: fakeRunner(found(candidate)) });
  const limited = fakeRunner(() => ({ ok: false, reason: "rate-limited", detail: "429" }));
  const stats = await runDiscover({ db, geocoder, now, runId: "r2", limits, ff: f.ff, runner: limited });
  assert.equal(stats.searches, 1);
  assert.equal(stats.published, 1);
  assert.equal(f.puts.length, 1);
});

test("one household's failure does not stop the others", async () => {
  const f = fakeFf([household("bad"), household("h2")], {});
  const base = f.ff.getState;
  f.ff.getState = async (id) => {
    if (id === "bad") throw new Error("boom");
    return base(id);
  };
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.errors, 1);
  assert.equal(stats.published, 1);
});

test("household is marked discovered after a successful pass, also in dry-run", async () => {
  for (const dryRun of [false, true]) {
    const db = openEventsDb(":memory:");
    const f = fakeFf([household("h1")], {});
    await runDiscover({ db, geocoder, now, runId: "r", limits, dryRun, ff: f.ff, runner: fakeRunner(found(candidate)) });
    assert.equal(listHouseholds(db)[0].lastDiscoveredAt, now.toISOString());
  }
});
