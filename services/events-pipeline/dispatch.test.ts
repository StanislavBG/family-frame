import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT, SAMPLE_RECOMMENDATION_INPUT, EVENTS_LIMITS, type FfEvent } from "../../shared/events";
import type { HaikuResult, HaikuRunInput, HaikuRunner } from "./haiku";
import type { FfClient } from "./ff-client";
import {
  getEvent,
  listHouseholds,
  listHouseholdsHoldingEvent,
  openEventsDb,
  recordRecommendation,
  upsertEvent,
  upsertHousehold,
  type EventsDb,
} from "./db";
import { nextCheckAt, runDispatch } from "./dispatch";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

function ev(id: string, startInDays: number, patch: Partial<FfEvent> = {}): FfEvent {
  const start = iso(NOW.getTime() + startInDays * DAY);
  return {
    ...SAMPLE_EVENT,
    id,
    fingerprint: `fp-${id}`,
    status: "scheduled",
    updates: [],
    schedule: { ...SAMPLE_EVENT.schedule, start, end: iso(NOW.getTime() + startInDays * DAY + 3600000), occurrences: [] },
    verification: { lastCheckedAt: "2026-10-01T00:00:00.000Z", checkCount: 1, confidence: 0.8 },
    ...patch,
  };
}

function seed(db: EventsDb, event: FfEvent, households: string[]): void {
  upsertEvent(db, event, "portland", "2026-10-10T00:00:00.000Z");
  for (const h of households) {
    upsertHousehold(db, {
      id: h, address: {}, addressHash: h, lat: 1, lon: 1, areaKey: "portland", profile: {}, updatedAt: "2026-10-01T00:00:00.000Z",
    });
    recordRecommendation(db, {
      householdId: h, eventId: event.id, publishedAt: "2026-10-01T00:00:00.000Z", publishedHash: "x",
      published: { ...SAMPLE_RECOMMENDATION_INPUT, event },
    });
  }
}

function fakeRunner(results: HaikuResult[]): HaikuRunner & { calls: HaikuRunInput[] } {
  const calls: HaikuRunInput[] = [];
  return {
    calls,
    async run(input) {
      calls.push(input);
      return results[calls.length - 1] ?? { ok: false, reason: "budget-exhausted", detail: "none" };
    },
  };
}

function fakeFf(notSharing: string[] = []) {
  const pushes: { householdId: string; ids: string[]; status: string; updates: number }[] = [];
  const ff = {
    async putRecommendations(householdId, body) {
      if (notSharing.includes(householdId)) return { notSharing: true as const };
      pushes.push({
        householdId,
        ids: body.recommendations.map((r) => r.event.id),
        status: body.recommendations[0].event.status,
        updates: body.recommendations[0].event.updates.length,
      });
      return { created: 0, updated: 1, unchanged: 0, ids: [], changed: [] };
    },
  } as Pick<FfClient, "putRecommendations">;
  return { ff, pushes };
}

const okData = (data: unknown): HaikuResult => ({ ok: true, data });
const NO_CHANGE = { status: "scheduled", changes: [], confidence: 0.9 };

test("nextCheckAt cadence", () => {
  const at = (days: number) => nextCheckAt(ev("a", days), NOW);
  assert.equal(at(1), iso(NOW.getTime() + DAY));
  assert.equal(at(3), iso(NOW.getTime() + DAY));
  assert.equal(at(10), iso(NOW.getTime() + 2 * DAY));
  assert.equal(at(14), iso(NOW.getTime() + 2 * DAY));
  assert.equal(at(30), iso(NOW.getTime() + 7 * DAY));
  assert.equal(at(-5), null);
  const ongoing = ev("b", 0, {});
  ongoing.schedule = { ...ongoing.schedule, start: iso(NOW.getTime() - 3600000), end: iso(NOW.getTime() + 3600000) };
  assert.equal(nextCheckAt(ongoing, NOW), iso(NOW.getTime() + DAY));
});

test("cancellation is pushed to two households", async () => {
  const db = openEventsDb(":memory:");
  seed(db, ev("e1", 5), ["h1", "h2"]);
  const runner = fakeRunner([
    okData({
      status: "cancelled",
      changes: [{ kind: "cancelled", summary: "Cancelled due to weather", sourceUrl: "https://example.org/x" }],
      confidence: 0.95,
    }),
  ]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner, ff, now: NOW, runId: "r1" });
  assert.deepEqual(stats, { checked: 1, changed: 1, cancelled: 1, pushed: 2, failed: 0 });
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(pushes.map((p) => [p.householdId, p.status]), [["h1", "cancelled"], ["h2", "cancelled"]]);
  const saved = getEvent(db, "e1")!;
  assert.equal(saved.status, "cancelled");
  assert.equal(saved.updates.length, 1);
  assert.equal(saved.verification.checkCount, 2);
  assert.equal(saved.verification.lastChangedAt, NOW.toISOString());
});

test("price change is appended to updates and cost updated", async () => {
  const db = openEventsDb(":memory:");
  const base = ev("e2", 20);
  base.updates = Array.from({ length: EVENTS_LIMITS.maxUpdates }, (_, i) => ({
    at: "2026-09-01T00:00:00.000Z", kind: "announcement" as const, summary: `old ${i}`,
  }));
  seed(db, base, ["h1"]);
  const runner = fakeRunner([
    okData({
      status: "scheduled",
      changes: [{ kind: "price-changed", summary: "Tickets now $12", field: "cost", before: "$10", after: "$12" }],
      cost: { isFree: false, minPrice: 12, currency: "USD" },
      confidence: 0.9,
    }),
  ]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner, ff, now: NOW, runId: "r2" });
  assert.equal(stats.changed, 1);
  assert.equal(stats.cancelled, 0);
  const saved = getEvent(db, "e2")!;
  assert.equal(saved.updates.length, EVENTS_LIMITS.maxUpdates);
  assert.equal(saved.updates.at(-1)!.kind, "price-changed");
  assert.equal(saved.updates[0].summary, "old 1");
  assert.equal(saved.cost.minPrice, 12);
  assert.equal(pushes.length, 1);
});

test("no change only bumps lastCheckedAt", async () => {
  const db = openEventsDb(":memory:");
  seed(db, ev("e3", 20), ["h1"]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner: fakeRunner([okData(NO_CHANGE)]), ff, now: NOW, runId: "r3" });
  assert.deepEqual(stats, { checked: 1, changed: 0, cancelled: 0, pushed: 0, failed: 0 });
  const saved = getEvent(db, "e3")!;
  assert.equal(saved.verification.lastCheckedAt, NOW.toISOString());
  assert.equal(saved.verification.lastChangedAt, undefined);
  assert.equal(saved.updates.length, 0);
  assert.equal(pushes.length, 0);
});

test("failed check is rescheduled in 6 hours", async () => {
  const db = openEventsDb(":memory:");
  seed(db, ev("e4", 5), ["h1"]);
  const runner = fakeRunner([{ ok: false, reason: "bad-output", detail: "nope" }]);
  const stats = await runDispatch({ db, runner, ff: fakeFf().ff, now: NOW, runId: "r4" });
  assert.equal(stats.failed, 1);
  assert.equal(stats.checked, 0);
  const row = db.prepare("SELECT next_check_at FROM events WHERE id = 'e4'").get();
  assert.equal(row?.next_check_at, iso(NOW.getTime() + 6 * 3600000));
});

test("rate limit stops the loop", async () => {
  const db = openEventsDb(":memory:");
  seed(db, ev("e5", 5), []);
  seed(db, ev("e6", 6), []);
  const runner = fakeRunner([{ ok: false, reason: "rate-limited", detail: "429" }]);
  const stats = await runDispatch({ db, runner, ff: fakeFf().ff, now: NOW, runId: "r5" });
  assert.equal(runner.calls.length, 1);
  assert.equal(stats.failed, 0);
  assert.equal(stats.checked, 0);
});

test("notSharing household is purged", async () => {
  const db = openEventsDb(":memory:");
  seed(db, ev("e7", 5), ["h1", "h2"]);
  const runner = fakeRunner([
    okData({ status: "scheduled", changes: [{ kind: "time-changed", summary: "Starts an hour later" }], confidence: 0.9 }),
  ]);
  const { ff, pushes } = fakeFf(["h1"]);
  const stats = await runDispatch({ db, runner, ff, now: NOW, runId: "r6" });
  assert.equal(stats.pushed, 1);
  assert.deepEqual(pushes.map((p) => p.householdId), ["h2"]);
  assert.deepEqual(listHouseholds(db).map((h) => h.id), ["h2"]);
  assert.deepEqual(listHouseholdsHoldingEvent(db, "e7"), ["h2"]);
});
