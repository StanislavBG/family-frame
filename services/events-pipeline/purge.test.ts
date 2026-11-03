import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT, SAMPLE_RECOMMENDATION_INPUT, type FfEvent } from "../../shared/events";
import { getEvent, listHouseholds, listRecommendationsForHousehold, openEventsDb, recordRecommendation, upsertEvent, upsertHousehold, type EventsDb } from "./db";
import type { FfClient } from "./ff-client";
import { runPurgeSignups } from "./purge";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const OLD_CHECK = "2027-01-01T00:00:00.000Z";

function ev(id: string, patch: Partial<FfEvent> = {}, official = true): FfEvent {
  return {
    ...SAMPLE_EVENT,
    id,
    fingerprint: `fp-${id}`,
    title: `Event ${id}`,
    tags: ["fun"],
    status: "scheduled",
    updates: [],
    schedule: { ...SAMPLE_EVENT.schedule, start: iso(NOW.getTime() + 5 * DAY), end: iso(NOW.getTime() + 5 * DAY + 3600000), occurrences: [] },
    sources: official ? SAMPLE_EVENT.sources : SAMPLE_EVENT.sources.map((s) => ({ ...s, kind: "listing" as const })),
    ...patch,
  };
}

const signUp = (id: string, official = true) => ev(id, { cost: { ...SAMPLE_EVENT.cost!, registrationRequired: true } }, official);

function seedHousehold(db: EventsDb, h: string) {
  upsertHousehold(db, { id: h, address: {}, addressHash: h, lat: 1, lon: 1, areaKey: "p", profile: {}, updatedAt: "2026-10-01T00:00:00.000Z" });
}

function hold(db: EventsDb, h: string, event: FfEvent, trip = false) {
  upsertEvent(db, event, "p", OLD_CHECK);
  recordRecommendation(db, {
    householdId: h,
    eventId: event.id,
    publishedAt: "2026-10-01T00:00:00.000Z",
    publishedHash: "x",
    published: { ...SAMPLE_RECOMMENDATION_INPUT, event, ...(trip ? { tripType: "day-trip" as const, trip: {} as never } : {}) },
  });
}

function fakeFf(states: Record<string, { eventId: string; response: string; calendarLinked: boolean }[] | "notSharing">) {
  const withdrawn: string[] = [];
  const ff = {
    listHouseholds: async () => Object.keys(states).map((householdId) => ({ householdId })),
    getState: async (h: string) => {
      const s = states[h];
      if (s === "notSharing") return { notSharing: true };
      return { householdId: h, recommendations: s.map((r) => ({ ...r, withdrawn: false })) };
    },
    withdraw: async (h: string, id: string) => {
      withdrawn.push(`${h}/${id}`);
      return { deleted: true };
    },
  } as unknown as FfClient;
  return { ff, withdrawn };
}

function setup() {
  const db = openEventsDb(":memory:");
  seedHousehold(db, "h1");
  hold(db, "h1", signUp("new1"));
  hold(db, "h1", signUp("going1"));
  hold(db, "h1", ev("trip1", { title: "Pottery class trip" }), true);
  hold(db, "h1", ev("plain1"));
  hold(db, "h1", ev("noofficial", {}, false));
  upsertEvent(db, signUp("unheldSignup"), "p", OLD_CHECK);
  upsertEvent(db, ev("unheldOld", {}, false), "p", OLD_CHECK);
  upsertEvent(db, ev("unheldOk"), "p", OLD_CHECK);
  seedHousehold(db, "h2");
  hold(db, "h2", signUp("gone1"));
  const st = {
    h1: [
      { eventId: "new1", response: "new", calendarLinked: false },
      { eventId: "going1", response: "going", calendarLinked: true },
      { eventId: "trip1", response: "new", calendarLinked: false },
      { eventId: "plain1", response: "new", calendarLinked: false },
      { eventId: "noofficial", response: "new", calendarLinked: false },
    ],
    h2: "notSharing" as const,
  };
  return { db, ...fakeFf(st) };
}

test("real run withdraws only new unlinked sign-ups and cleans local state", async () => {
  const { db, ff, withdrawn } = setup();
  const r = await runPurgeSignups({ db, ff, now: NOW, dryRun: false });
  assert.deepEqual(withdrawn, ["h1/new1"]);
  const h1 = r.households.find((h) => h.householdId === "h1")!;
  assert.equal(h1.withdrawn, 1);
  assert.equal(h1.kept, 1);
  assert.deepEqual(h1.titles, ["Event new1"]);
  const ids = listRecommendationsForHousehold(db, "h1").map((x) => x.eventId).sort();
  assert.deepEqual(ids, ["going1", "noofficial", "plain1", "trip1"]);
  assert.ok(getEvent(db, "trip1"), "trip untouched");
  assert.equal(listHouseholds(db).some((h) => h.id === "h2"), false, "notSharing household deleted");
  assert.equal(getEvent(db, "unheldSignup"), null);
  assert.equal(getEvent(db, "unheldOld"), null);
  assert.ok(getEvent(db, "unheldOk"));
  assert.equal(r.deletedEvents >= 3, true);
  const due = (id: string) => (db.prepare("SELECT next_check_at AS n FROM events WHERE id = ?").get(id) as { n: string }).n;
  assert.equal(due("noofficial"), NOW.toISOString());
  assert.equal(due("plain1"), OLD_CHECK);
  assert.equal(r.markedDue, 1);
});

test("dry run changes nothing and idempotent second run", async () => {
  const { db, ff, withdrawn } = setup();
  const dry = await runPurgeSignups({ db, ff, now: NOW, dryRun: true });
  assert.equal(withdrawn.length, 0);
  assert.equal(dry.households.find((h) => h.householdId === "h1")!.withdrawn, 1);
  assert.equal(dry.deletedEvents, 0);
  assert.equal(listRecommendationsForHousehold(db, "h1").length, 5);
  assert.ok(getEvent(db, "unheldSignup"));
  await runPurgeSignups({ db, ff, now: NOW, dryRun: false });
  const before = withdrawn.length;
  const again = await runPurgeSignups({ db, ff, now: NOW, dryRun: false });
  assert.equal(withdrawn.length, before);
  assert.equal(again.deletedEvents, 0);
  assert.equal(again.households.find((h) => h.householdId === "h1")!.withdrawn, 0);
});
