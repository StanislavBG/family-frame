import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT } from "../../shared/events";
import { openEventsDb, recordRecommendation, upsertHousehold } from "./db";
import { buildReport } from "./report";

const STREET = "742 Evergreen Terrace";

test("buildReport renders runs, losses and recommendations without private data", () => {
  const db = openEventsDb(":memory:");
  upsertHousehold(db, {
    id: "hh1",
    address: { street: STREET, city: "Portland" },
    addressHash: "secrethash123",
    lat: 45.512345,
    lon: -122.654321,
    areaKey: "portland",
    profile: { kids: 2 },
    updatedAt: "2026-10-10T00:00:00.000Z",
  });
  const stats = {
    households: 1, purged: 0, searches: 6, candidates: 40, newEvents: 5, merged: 1, published: 2, skipped: 3, errors: 0,
    normalizeRejected: 7,
    normalizeRejectReasons: { "no-date": 5, "bad-url": 2 },
    searchFailures: { timeout: 1 },
    skippedByReason: { "too-far": 3 },
    ranked: 4,
    phaseMs: { prepare: 10, search: 2000, rank: 300, explain: 400, publish: 50 },
    haiku: { sessions: 9, ok: 8, refused: 0, failures: {}, costUsd: 0.5, totalMs: 1000 },
  };
  const ins = db.prepare("INSERT INTO runs (id, kind, started_at, finished_at, stats_json, error) VALUES (?, ?, ?, ?, ?, ?)");
  ins.run("r1", "discover", "2026-10-10T17:00:00.000Z", "2026-10-10T17:01:30.000Z", JSON.stringify(stats), null);
  ins.run("r2", "watch", "2026-10-09T17:00:00.000Z", "2026-10-09T17:00:05.000Z", "{not json", null);

  for (const [id, start, score, dist] of [["e1", "2026-11-02T18:00:00.000Z", 0.8, 3.14], ["e2", "2026-11-01T18:00:00.000Z", 0.5, undefined]] as const) {
    recordRecommendation(db, {
      householdId: "hh1",
      eventId: id,
      publishedAt: "2026-10-10T17:01:00.000Z",
      publishedHash: `ph-${id}`,
      response: id === "e1" ? "going" : null,
      published: {
        event: { ...SAMPLE_EVENT, id, fingerprint: `fp-${id}`, title: `Event ${id}`, schedule: { ...SAMPLE_EVENT.schedule, start: start } },
        whyForHousehold: "why",
        highlights: [],
        tips: [],
        matchScore: score,
        matchReasons: [],
        distanceKm: dist,
      },
    });
  }

  const md = buildReport(db, { now: new Date("2026-10-10T18:00:00.000Z") });
  assert.match(md, /## Runs/);
  assert.match(md, /## Where candidates were lost/);
  assert.match(md, /## Recommendations/);
  assert.match(md, /\$0\.5000/);
  assert.match(md, /P[DS]T/);
  assert.match(md, /no-date: 5/);
  assert.match(md, /too-far: 3/);
  assert.match(md, /Event e2[\s\S]*Event e1/);
  assert.match(md, /0\.80 \| 3\.1/);
  assert.match(md, /Cost per published rec: \$0\.2500/);
  assert.match(md, /\| watch \|[^\n]*\| - \| - \| - \|/);
  for (const secret of [STREET, "secrethash123", "45.512345", "-122.654321", "kids"]) {
    assert.ok(!md.includes(secret), secret);
  }
  db.close();
});
