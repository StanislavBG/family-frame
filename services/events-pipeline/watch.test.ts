import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eventPreferencesSchema } from "../../shared/events";
import { listHouseholds, markHouseholdDiscovered, markHouseholdTriggered, openEventsDb, upsertHousehold } from "./db";
import { addressHashOf } from "./discover";
import type { FfClient, FfHousehold } from "./ff-client";
import type { HaikuRunner } from "./haiku";
import { areaKey } from "./geo";
import { findPendingHouseholds, runWatch } from "./watch";

const now = new Date("2026-10-10T12:00:00Z");
const nowIso = now.toISOString();
const address = { line1: "1 Main St", city: "Portland", region: "OR", country: "United States", timezone: "America/Los_Angeles" };

function household(id: string, addr: typeof address = address): FfHousehold {
  return {
    householdId: id,
    address: addr,
    timezone: "America/Los_Angeles",
    memberAges: [38, 36, 5],
    preferences: eventPreferencesSchema.parse({}),
    learned: {},
    lastPublishedAt: null,
    consentVersion: 1,
  };
}

function seed(db: ReturnType<typeof openEventsDb>, id: string, addr: typeof address = address) {
  upsertHousehold(db, { id, address: addr, addressHash: addressHashOf(addr), lat: 1, lon: 2, areaKey: areaKey(addr), profile: null, updatedAt: "t" });
}

test("new household is pending", () => {
  const r = findPendingHouseholds([household("h1")], [], nowIso);
  assert.deepEqual(r, { pending: [{ householdId: "h1", reason: "new" }], deferred: 0 });
});

test("unchanged discovered household is not pending", () => {
  const db = openEventsDb(":memory:");
  seed(db, "h1");
  markHouseholdDiscovered(db, "h1", "2026-10-10T00:00:00Z");
  assert.deepEqual(findPendingHouseholds([household("h1")], listHouseholds(db), nowIso).pending, []);
});

test("address change is pending", () => {
  const db = openEventsDb(":memory:");
  seed(db, "h1");
  markHouseholdDiscovered(db, "h1", "2026-10-10T00:00:00Z");
  const moved = household("h1", { ...address, line1: "2 Elm St" });
  assert.deepEqual(findPendingHouseholds([moved], listHouseholds(db), nowIso).pending, [{ householdId: "h1", reason: "address-changed" }]);
});

test("never-discovered household is pending", () => {
  const db = openEventsDb(":memory:");
  seed(db, "h1");
  assert.deepEqual(findPendingHouseholds([household("h1")], listHouseholds(db), nowIso).pending, [{ householdId: "h1", reason: "never-discovered" }]);
});

test("recently triggered household is skipped, old trigger is not", () => {
  const db = openEventsDb(":memory:");
  seed(db, "h1");
  markHouseholdTriggered(db, "h1", "2026-10-10T11:50:00Z");
  assert.equal(findPendingHouseholds([household("h1")], listHouseholds(db), nowIso).pending.length, 0);
  markHouseholdTriggered(db, "h1", "2026-10-10T11:00:00Z");
  assert.equal(findPendingHouseholds([household("h1")], listHouseholds(db), nowIso).pending.length, 1);
});

test("maxPerTick caps results, oldest-triggered first", () => {
  const db = openEventsDb(":memory:");
  for (const id of ["a", "b", "c", "d"]) seed(db, id);
  markHouseholdTriggered(db, "a", "2026-10-10T09:00:00Z");
  markHouseholdTriggered(db, "b", "2026-10-10T08:00:00Z");
  markHouseholdTriggered(db, "c", "2026-10-10T10:00:00Z");
  const r = findPendingHouseholds(["a", "b", "c", "d"].map((id) => household(id)), listHouseholds(db), nowIso, { maxPerTick: 3 });
  assert.deepEqual(r.pending.map((p) => p.householdId), ["d", "b", "a"]);
  assert.equal(r.deferred, 1);
});

function fakes() {
  const calls: string[] = [];
  const runner: HaikuRunner = {
    run: async () => {
      calls.push("runner");
      return { ok: false, reason: "failed", detail: "none" };
    },
  };
  const geocoder = {
    geocode: async () => {
      calls.push("geocode");
      return { lat: 45.5, lon: -122.6 };
    },
  };
  return { calls, runner, geocoder };
}

function ffFor(households: FfHousehold[], seen: string[] = []): Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations" | "recordRun"> {
  return {
    listHouseholds: async () => {
      seen.push("list");
      return households;
    },
    getState: async (id) => {
      seen.push(`state:${id}`);
      return { householdId: id, recommendations: [], busy: [], feedback: [], preferences: eventPreferencesSchema.parse({}), learned: {} };
    },
    putRecommendations: async (_id, body) => ({ created: body.recommendations.length, updated: 0, unchanged: 0, ids: [], changed: [] }),
    recordRun: async () => ({ lastRunId: "r", lastPublishedAt: nowIso, lastRun: null }),
  };
}

test("nothing pending: one list call, runner and geocoder untouched", async () => {
  const db = openEventsDb(":memory:");
  seed(db, "h1");
  markHouseholdDiscovered(db, "h1", "2026-10-10T00:00:00Z");
  const f = fakes();
  const seen: string[] = [];
  const res = await runWatch({ db, ff: ffFor([household("h1")], seen), runner: f.runner, geocoder: f.geocoder, now, runIdPrefix: "w" });
  assert.deepEqual(seen, ["list"]);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(res, { listed: 1, pending: 0, deferred: 0, runs: [] });
});

test("pending household runs discover for only that household and is marked discovered", async () => {
  const db = openEventsDb(":memory:");
  seed(db, "old");
  markHouseholdDiscovered(db, "old", "2026-10-10T00:00:00Z");
  const f = fakes();
  const seen: string[] = [];
  const res = await runWatch({ db, ff: ffFor([household("old"), household("fresh")], seen), runner: f.runner, geocoder: f.geocoder, now, runIdPrefix: "w" });
  assert.equal(res.pending, 1);
  assert.equal(res.runs[0].householdId, "fresh");
  assert.equal(res.runs[0].reason, "new");
  assert.ok(res.runs[0].stats);
  assert.deepEqual(seen.filter((s) => s.startsWith("state:")), ["state:fresh"]);
  const fresh = listHouseholds(db).find((h) => h.id === "fresh");
  assert.equal(fresh?.lastDiscoveredAt, nowIso);
  assert.equal(fresh?.lastTriggeredAt, nowIso);
});

test("a throwing runDiscover is recorded as an error and the next household still runs", async () => {
  const db = openEventsDb(":memory:");
  const f = fakes();
  const ff = ffFor([household("a"), household("b")]);
  ff.recordRun = async () => ({ lastRunId: "r", lastPublishedAt: nowIso, lastRun: null });
  // Fail the first run at the DB level by pre-inserting its run id.
  db.prepare("INSERT INTO runs (id, kind, started_at) VALUES (?, ?, ?)").run("w-a", "discover", "t");
  const res = await runWatch({ db, ff, runner: f.runner, geocoder: f.geocoder, now, runIdPrefix: "w" });
  assert.equal(res.runs.length, 2);
  assert.ok(res.runs[0].error);
  assert.ok(res.runs[1].stats);
});

test("migration runs twice on an old-schema file without error", () => {
  const dir = mkdtempSync(join(tmpdir(), "watch-mig-"));
  try {
    const path = join(dir, "events.db");
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE households (id TEXT PRIMARY KEY, address_json TEXT, address_hash TEXT, lat REAL, lon REAL, area_key TEXT, profile_json TEXT, updated_at TEXT)");
    old.close();
    for (let i = 0; i < 2; i++) {
      const db = openEventsDb(path);
      const cols = db.prepare("PRAGMA table_info(households)").all().map((c) => c.name);
      assert.ok(cols.includes("last_discovered_at") && cols.includes("last_triggered_at"));
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
