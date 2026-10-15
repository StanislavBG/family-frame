import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT, type FfEvent } from "../../shared/events";
import {
  deleteHousehold,
  finishRun,
  getEvent,
  getEventByFingerprint,
  getGeocode,
  lastSearchAt,
  listDueForRecheck,
  listHouseholds,
  listHouseholdsHoldingEvent,
  listRecommendationsForHousehold,
  logSearch,
  openEventsDb,
  pruneLocalState,
  putGeocode,
  recordRecommendation,
  startRun,
  upsertEvent,
  upsertHousehold,
} from "./db";

function ev(id: string, patch: Partial<FfEvent> = {}): FfEvent {
  return { ...SAMPLE_EVENT, id, fingerprint: `fp-${id}`, ...patch };
}

const household = (id: string) => ({
  id,
  address: { city: "Portland" },
  addressHash: `h-${id}`,
  lat: 45.5,
  lon: -122.6,
  areaKey: "portland",
  profile: { kids: 2 },
  updatedAt: "2026-10-10T00:00:00.000Z",
});

test("schema creation is idempotent and sets user_version", () => {
  const db = openEventsDb(":memory:");
  const tables = () =>
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
  const before = tables();
  db.exec("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY)");
  assert.deepEqual(tables(), before);
  for (const t of ["events", "households", "recommendations", "search_log", "geocode_cache", "runs"]) {
    assert.ok(before.includes(t), t);
  }
  assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 4);
  db.close();
});

test("upsertEvent round-trips FfEvent JSON by fingerprint and id", () => {
  const db = openEventsDb(":memory:");
  const e = ev("a");
  upsertEvent(db, e, "portland", "2026-10-11T00:00:00.000Z");
  assert.deepEqual(getEventByFingerprint(db, "fp-a"), e);
  assert.deepEqual(getEvent(db, "a"), e);
  upsertEvent(db, { ...e, title: "Renamed" }, "portland", "2026-10-12T00:00:00.000Z");
  assert.equal(getEvent(db, "a")?.title, "Renamed");
  assert.equal(getEvent(db, "missing"), null);
  assert.throws(() => upsertEvent(db, { ...e, title: "" }, "portland", "x"));
  db.close();
});

test("deleteHousehold removes its recommendations only", () => {
  const db = openEventsDb(":memory:");
  upsertHousehold(db, household("h1"));
  upsertHousehold(db, household("h2"));
  const rec = (householdId: string) =>
    recordRecommendation(db, { householdId, eventId: "a", publishedAt: "t", publishedHash: "x" });
  rec("h1");
  rec("h2");
  assert.deepEqual(listHouseholdsHoldingEvent(db, "a"), ["h1", "h2"]);
  deleteHousehold(db, "h1");
  assert.deepEqual(listHouseholds(db).map((h) => h.id), ["h2"]);
  assert.deepEqual(listRecommendationsForHousehold(db, "h1"), []);
  assert.equal(listRecommendationsForHousehold(db, "h2").length, 1);
  db.close();
});

test("recordRecommendation keeps an existing response when none is given", () => {
  const db = openEventsDb(":memory:");
  const base = { householdId: "h1", eventId: "a", publishedAt: "t1", publishedHash: "x" };
  recordRecommendation(db, { ...base, response: "going" });
  recordRecommendation(db, { ...base, publishedAt: "t2" });
  const [r] = listRecommendationsForHousehold(db, "h1");
  assert.equal(r.response, "going");
  assert.equal(r.publishedAt, "t2");
  db.close();
});

test("listDueForRecheck orders by next_check_at and skips ended/cancelled", () => {
  const db = openEventsDb(":memory:");
  upsertEvent(db, ev("late"), "p", "2026-10-09T00:00:00.000Z");
  upsertEvent(db, ev("early"), "p", "2026-10-01T00:00:00.000Z");
  upsertEvent(db, ev("future"), "p", "2026-12-01T00:00:00.000Z");
  upsertEvent(db, ev("ended", { status: "ended" }), "p", "2026-09-01T00:00:00.000Z");
  upsertEvent(db, ev("cancelled", { status: "cancelled" }), "p", "2026-09-02T00:00:00.000Z");
  const due = listDueForRecheck(db, "2026-10-10T00:00:00.000Z", 10);
  assert.deepEqual(due.map((e) => e.id), ["early", "late"]);
  assert.equal(listDueForRecheck(db, "2026-10-10T00:00:00.000Z", 1).length, 1);
  db.close();
});

test("lastSearchAt returns the latest timestamp", () => {
  const db = openEventsDb(":memory:");
  assert.equal(lastSearchAt(db, "p", "2w", "parks"), null);
  for (const ranAt of ["2026-10-02T00:00:00.000Z", "2026-10-05T00:00:00.000Z", "2026-10-03T00:00:00.000Z"]) {
    logSearch(db, { areaKey: "p", windowKey: "2w", categoryKey: "parks", query: "q", ranAt, results: 3 });
  }
  logSearch(db, { areaKey: "p", windowKey: "2w", categoryKey: "other", query: "q", ranAt: "2026-11-01T00:00:00.000Z", results: 0 });
  assert.equal(lastSearchAt(db, "p", "2w", "parks"), "2026-10-05T00:00:00.000Z");
  db.close();
});

test("geocode cache and run log round-trip", () => {
  const db = openEventsDb(":memory:");
  const g = { queryHash: "q1", query: "1 Main St", lat: 1.5, lon: 2.5, provider: "test", createdAt: "t" };
  putGeocode(db, g);
  assert.deepEqual(getGeocode(db, "q1"), g);
  assert.equal(getGeocode(db, "nope"), null);
  const id = startRun(db, "discover", "t0");
  finishRun(db, id, "t1", { found: 2 });
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
  assert.equal(row?.finished_at, "t1");
  assert.equal(row?.stats_json, '{"found":2}');
  db.close();
});

test("opening a v3 database rewrites area keys to the canonical form once", () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-areakey-"));
  const path = join(dir, "events.db");
  const db = openEventsDb(path);
  const addrs = [
    { city: "Santa Clara, CA", region: "CA", country: "USA" },
    { city: "Santa Clara", region: "", country: "US" },
    { city: "Santa Clara", region: "California", country: "United States" },
  ];
  const legacy = ["santa clara, ca|ca|usa", "santa clara|ca|usa", "santa clara||us"];
  addrs.forEach((a, i) => {
    db.prepare("INSERT INTO households (id, address_json, area_key) VALUES (?, ?, ?)").run(`h${i}`, JSON.stringify(a), legacy[i]);
    db.prepare("INSERT INTO events (id, fingerprint, area_key) VALUES (?, ?, ?)").run(`e${i}`, `fp${i}`, legacy[i]);
    db.prepare("INSERT INTO search_log (area_key, window_key, category_key) VALUES (?, 'w', 'c')").run(legacy[i]);
  });
  db.exec("PRAGMA user_version = 3");
  db.close();

  const keys = (d: DatabaseSync) =>
    ["households", "events", "search_log"].map((t) =>
      d.prepare(`SELECT DISTINCT area_key FROM ${t}`).all().map((r) => r.area_key),
    );
  const again = openEventsDb(path);
  assert.deepEqual(keys(again), [["santa clara|us"], ["santa clara|us"], ["santa clara|us"]]);
  assert.equal(again.prepare("PRAGMA user_version").get()?.user_version, 4);
  // A row edited after migration must survive a second open untouched.
  again.prepare("UPDATE events SET area_key = 'x|y' WHERE id = 'e0'").run();
  again.close();
  const third = openEventsDb(path);
  assert.equal(third.prepare("SELECT area_key FROM events WHERE id = 'e0'").get()?.area_key, "x|y");
  third.close();
});

test("pruneLocalState drops stale rows, keeps live ones and households", () => {
  const db = openEventsDb(":memory:");
  const now = "2026-10-15T12:00:00.000Z";
  const next = "2026-10-20T00:00:00.000Z";
  upsertHousehold(db, household("h1"));
  const put = (id: string, startAt: string, endAt: string | null) => {
    upsertEvent(db, ev(id), "portland", next);
    db.prepare("UPDATE events SET start_at = ?, end_at = ? WHERE id = ?").run(startAt, endAt ?? null, id);
    recordRecommendation(db, { householdId: "h1", eventId: id, publishedAt: "t", publishedHash: "x" });
  };
  put("old", "2026-08-01T10:00:00", "2026-08-01T12:00:00");
  put("recent", "2026-09-25T10:00:00", "2026-09-25T12:00:00");
  put("multi", "2026-08-16T10:00:00", "2026-11-01T12:00:00");
  put("dateOnlyOld", "2026-09-01", "2026-09-10");
  put("dateOnlyKept", "2026-09-01", "2026-09-16");
  logSearch(db, { areaKey: "p", windowKey: "2w", categoryKey: "c", query: "q", ranAt: "2026-09-01T00:00:00.000Z", results: 1 });
  logSearch(db, { areaKey: "p", windowKey: "2w", categoryKey: "c", query: "q", ranAt: "2026-10-10T00:00:00.000Z", results: 1 });
  finishRun(db, startRun(db, "discover", "2026-07-01T00:00:00.000Z"), "t1", {});
  finishRun(db, startRun(db, "discover", "2026-09-01T00:00:00.000Z"), "t1", {});
  putGeocode(db, { queryHash: "q1", query: "q", lat: 1, lon: 2, provider: "t", createdAt: "2020-01-01" });

  const counts = pruneLocalState(db, now);
  assert.deepEqual(counts, { events: 2, recommendations: 2, searchLog: 1, runs: 1 });
  const ids = (db.prepare("SELECT id FROM events ORDER BY id").all() as { id: string }[]).map((r) => r.id);
  assert.deepEqual(ids, ["dateOnlyKept", "multi", "recent"]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM recommendations").get() as { n: number }).n, 3);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM search_log").get() as { n: number }).n, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM runs").get() as { n: number }).n, 1);
  assert.equal(listHouseholds(db).length, 1);
  assert.ok(getGeocode(db, "q1"));
  assert.deepEqual(pruneLocalState(db, now), { events: 0, recommendations: 0, searchLog: 0, runs: 0 });
  db.close();
});
