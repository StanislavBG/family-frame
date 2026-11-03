import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_EVENT, SAMPLE_RECOMMENDATION_INPUT, EVENTS_LIMITS, type FfEvent } from "../../shared/events";
import type { HaikuResult, HaikuRunInput, HaikuRunner } from "./haiku";
import type { FfClient } from "./ff-client";
import type { LinkResult } from "./links";
import {
  getEvent,
  listRecommendationsForHousehold,
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

function fakeLinks(bad: string[] = []) {
  const checked: string[] = [];
  return {
    checked,
    async check(url: string): Promise<LinkResult> {
      checked.push(url);
      return bad.includes(url) ? { status: "dead", httpStatus: 404 } : { status: "ok", httpStatus: 200, finalUrl: url };
    },
  };
}

function fakeFf(notSharing: string[] = [], responses: Record<string, { response: string; calendarLinked?: boolean }> = {}, eventId = "") {
  const withdrawn: string[] = [];
  const stateCalls: string[] = [];
  const pushes: { householdId: string; ids: string[]; status: string; updates: number }[] = [];
  const ff = {
    async putRecommendations(householdId: string, body: Parameters<FfClient["putRecommendations"]>[1]) {
      if (notSharing.includes(householdId)) return { notSharing: true as const };
      pushes.push({
        householdId,
        ids: body.recommendations.map((r) => r.event.id),
        status: body.recommendations[0].event.status,
        updates: body.recommendations[0].event.updates.length,
      });
      return { created: 0, updated: 1, unchanged: 0, ids: [], changed: [] };
    },
    async getState(householdId: string) {
      stateCalls.push(householdId);
      if (notSharing.includes(householdId)) return { notSharing: true as const };
      const r = responses[householdId];
      return {
        householdId,
        recommendations: r ? [{ eventId, response: r.response, calendarLinked: r.calendarLinked ?? false }] : [],
      };
    },
    async withdraw(householdId: string) {
      withdrawn.push(householdId);
      return { deleted: true };
    },
  } as unknown as Pick<FfClient, "putRecommendations" | "getState" | "withdraw">;
  return { ff, pushes, withdrawn, stateCalls };
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
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "r1" });
  assert.deepEqual(stats, { checked: 1, changed: 1, cancelled: 1, pushed: 2, failed: 0, linksRemoved: 0, withdrawn: 0 });
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
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "r2" });
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
  const stats = await runDispatch({ db, runner: fakeRunner([okData(NO_CHANGE)]), ff, links: fakeLinks(), now: NOW, runId: "r3" });
  assert.deepEqual(stats, { checked: 1, changed: 0, cancelled: 0, pushed: 0, failed: 0, linksRemoved: 0, withdrawn: 0 });
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
  const stats = await runDispatch({ db, runner, ff: fakeFf().ff, links: fakeLinks(), now: NOW, runId: "r4" });
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
  const stats = await runDispatch({ db, runner, ff: fakeFf().ff, links: fakeLinks(), now: NOW, runId: "r5" });
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
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "r6" });
  assert.equal(stats.pushed, 1);
  assert.deepEqual(pushes.map((p) => p.householdId), ["h2"]);
  assert.deepEqual(listHouseholds(db).map((h) => h.id), ["h2"]);
  assert.deepEqual(listHouseholdsHoldingEvent(db, "e7"), ["h2"]);
});

const withLocation = (patch: Record<string, unknown>) => {
  const { parkingNotes: _p, accessibilityNotes: _a, address: _ad, postalCode: _pc, ...rest } = SAMPLE_EVENT.location;
  return { ...rest, ...patch } as FfEvent["location"];
};

test("recheck fills missing parking note and pushes a details-changed update", async () => {
  const db = openEventsDb(":memory:");
  const base = ev("e8", 5, { location: withLocation({ address: "1 Main St", accessibilityNotes: "Step-free" }) });
  seed(db, base, ["h1"]);
  const runner = fakeRunner([
    okData({
      status: "scheduled",
      changes: [],
      location: { parkingNotes: "Free lot behind the library", accessibilityNotes: "Ignored overwrite" },
      confidence: 0.9,
    }),
  ]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "r8" });
  assert.equal(stats.changed, 1);
  assert.equal(stats.pushed, 1);
  assert.equal(pushes.length, 1);
  assert.match(runner.calls[0].prompt, /parking notes/);
  const saved = getEvent(db, "e8")!;
  assert.equal(saved.location.parkingNotes, "Free lot behind the library");
  assert.equal(saved.location.accessibilityNotes, "Step-free");
  assert.equal(saved.updates.length, 1);
  assert.equal(saved.updates[0].kind, "details-changed");
  assert.match(saved.updates[0].summary, /parking/i);
});

test("recheck never overwrites an existing address and pushes nothing", async () => {
  const db = openEventsDb(":memory:");
  const base = ev("e9", 5, {
    location: withLocation({ address: "1 Main St", postalCode: "97201", parkingNotes: "Street", accessibilityNotes: "Ramp" }),
  });
  seed(db, base, ["h1"]);
  const runner = fakeRunner([
    okData({ status: "scheduled", changes: [], location: { address: "99 Other Rd" }, confidence: 0.9 }),
  ]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "r9" });
  assert.equal(stats.changed, 0);
  assert.equal(pushes.length, 0);
  assert.equal(getEvent(db, "e9")!.location.address, "1 Main St");
});

const signUpEvent = (id: string, url?: string) =>
  ev(id, 5, { cost: { ...SAMPLE_EVENT.cost, registrationRequired: true, registrationUrl: url } as FfEvent["cost"] });
const signUpResult = (registrationUrl: string) =>
  okData({ status: "scheduled", changes: [], cost: { registrationUrl }, confidence: 0.9 });

test("recheck fills missing sign-up link without a Changed update, and pushes", async () => {
  const db = openEventsDb(":memory:");
  seed(db, signUpEvent("s1"), ["h1"]);
  const runner = fakeRunner([signUpResult("https://riversidefarm.example/register")]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "s1" });
  assert.match(runner.calls[0].prompt, /registrationUrl/);
  assert.equal(stats.pushed, 1);
  assert.equal(pushes.length, 1);
  const saved = getEvent(db, "s1")!;
  assert.equal(saved.cost.registrationUrl, "https://riversidefarm.example/register");
  assert.equal(saved.updates.length, 0);
  assert.equal(saved.verification.lastChangedAt, undefined);
});

for (const [name, bad] of [["http", "http://example.org/register"], ["malformed", "not a url"]] as const) {
  test(`recheck drops ${name} sign-up link`, async () => {
    const db = openEventsDb(":memory:");
    seed(db, signUpEvent("s2"), ["h1"]);
    const { ff, pushes } = fakeFf();
    const stats = await runDispatch({ db, runner: fakeRunner([signUpResult(bad)]), ff, links: fakeLinks(), now: NOW, runId: "s2" });
    assert.equal(stats.failed, 0);
    assert.equal(pushes.length, 0);
    assert.equal(getEvent(db, "s2")!.cost.registrationUrl, undefined);
  });
}

test("recheck keeps a stored sign-up link and does not ask for one", async () => {
  const db = openEventsDb(":memory:");
  seed(db, signUpEvent("s3", "https://riversidefarm.example/old"), ["h1"]);
  const runner = fakeRunner([signUpResult("https://riversidefarm.example/new")]);
  const { ff, pushes } = fakeFf();
  await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "s3" });
  assert.doesNotMatch(runner.calls[0].prompt, /sign-up link is stored/);
  assert.equal(pushes.length, 0);
  assert.equal(getEvent(db, "s3")!.cost.registrationUrl, "https://riversidefarm.example/old");
});

const noOfficial = (id: string, patch: Partial<FfEvent> = {}) =>
  ev(id, 5, { sources: SAMPLE_EVENT.sources.filter((x) => x.kind !== "official"), ...patch });

test("dead registration link is removed and the event pushed", async () => {
  const db = openEventsDb(":memory:");
  const dead = "https://riversidefarm.example/register";
  seed(db, signUpEvent("l1", dead), ["h1"]);
  const { ff, pushes } = fakeFf();
  const stats = await runDispatch({ db, runner: fakeRunner([okData(NO_CHANGE)]), ff, links: fakeLinks([dead]), now: NOW, runId: "l1" });
  assert.equal(stats.linksRemoved, 1);
  assert.equal(stats.pushed, 1);
  assert.equal(pushes.length, 1);
  const saved = getEvent(db, "l1")!;
  assert.equal(saved.cost.registrationUrl, undefined);
  assert.equal(saved.updates.length, 0);
});

test("no official source and no valid find: withdrawn for new holders only", async () => {
  const db = openEventsDb(":memory:");
  seed(db, noOfficial("w1"), ["new1", "going", "linked", "new2"]);
  const { ff, withdrawn, stateCalls } = fakeFf([], {
    new1: { response: "new" },
    going: { response: "going" },
    linked: { response: "new", calendarLinked: true },
  }, "w1");
  const runner = fakeRunner([okData(NO_CHANGE)]);
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks(), now: NOW, runId: "w1" });
  assert.match(runner.calls[0].prompt, /officialUrl/);
  assert.equal(stats.withdrawn, 1);
  assert.deepEqual(withdrawn.sort(), ["new1", "new2"]);
  assert.deepEqual(stateCalls.sort(), ["going", "linked", "new1", "new2"]);
  assert.deepEqual(listHouseholdsHoldingEvent(db, "w1"), ["going", "linked"]);
  assert.equal(listRecommendationsForHousehold(db, "new1").length, 0);
  assert.ok(getEvent(db, "w1"));
});

test("event row is deleted once no household holds it", async () => {
  const db = openEventsDb(":memory:");
  seed(db, noOfficial("w2"), ["h1", "h2"]);
  const { ff, withdrawn } = fakeFf(["h2"], { h1: { response: "new" } }, "w2");
  const stats = await runDispatch({ db, runner: fakeRunner([okData(NO_CHANGE)]), ff, links: fakeLinks(), now: NOW, runId: "w2" });
  assert.equal(stats.withdrawn, 1);
  assert.deepEqual(withdrawn, ["h1"]);
  assert.equal(getEvent(db, "w2"), null);
  assert.deepEqual(listHouseholdsHoldingEvent(db, "w2"), []);
});

test("an aggregator officialUrl from the model is withdrawn", async () => {
  const db = openEventsDb(":memory:");
  seed(db, noOfficial("w3"), ["h1"]);
  const find = { organizerName: "X", organizerUrl: "https://www.activekids.com", officialUrl: "https://www.activekids.com/e/1" };
  const { ff, withdrawn } = fakeFf([], { h1: { response: "new" } }, "w3");
  const stats = await runDispatch({
    db, runner: fakeRunner([okData({ ...NO_CHANGE, official: find })]), ff, links: fakeLinks(), now: NOW, runId: "w3",
  });
  assert.equal(stats.withdrawn, 1);
  assert.deepEqual(withdrawn, ["h1"]);
  assert.equal(getEvent(db, "w3"), null);
});

test("a dead official source is replaced by a valid find, which becomes the first source", async () => {
  const db = openEventsDb(":memory:");
  const base = ev("o1", 5);
  seed(db, base, ["h1"]);
  const oldUrl = base.sources.find((x) => x.kind === "official")!.url;
  const find = {
    organizerName: "Riverside Farm",
    organizerUrl: "https://riversidefarm.example",
    officialUrl: "https://riversidefarm.example/events/pumpkins-2026",
  };
  const { ff, pushes, withdrawn } = fakeFf();
  const runner = fakeRunner([okData({ ...NO_CHANGE, official: find })]);
  const stats = await runDispatch({ db, runner, ff, links: fakeLinks([oldUrl]), now: NOW, runId: "o1" });
  assert.match(runner.calls[0].prompt, /officialUrl/);
  assert.equal(stats.withdrawn, 0);
  assert.equal(withdrawn.length, 0);
  assert.equal(pushes.length, 1);
  const saved = getEvent(db, "o1")!;
  assert.equal(saved.sources[0].url, find.officialUrl);
  assert.equal(saved.sources[0].kind, "official");
  assert.equal(saved.organizer?.url, "https://riversidefarm.example/");
});

test("backfill rejects an aggregator link and a dead link", async () => {
  for (const [id, url, bad] of [
    ["b1", "https://www.activekids.com/register/1", []],
    ["b2", "https://riversidefarm.example/dead", ["https://riversidefarm.example/dead"]],
  ] as const) {
    const db = openEventsDb(":memory:");
    seed(db, signUpEvent(id), ["h1"]);
    const { ff, pushes } = fakeFf();
    await runDispatch({ db, runner: fakeRunner([signUpResult(url)]), ff, links: fakeLinks([...bad]), now: NOW, runId: id });
    assert.equal(pushes.length, 0);
    assert.equal(getEvent(db, id)!.cost.registrationUrl, undefined);
  }
});

test("backfill accepts a registration-platform link that works", async () => {
  const db = openEventsDb(":memory:");
  seed(db, signUpEvent("b3"), ["h1"]);
  const url = "https://riverside.activecommunities.com/signup/1";
  const { ff, pushes } = fakeFf();
  await runDispatch({ db, runner: fakeRunner([signUpResult(url)]), ff, links: fakeLinks(), now: NOW, runId: "b3" });
  assert.equal(pushes.length, 1);
  assert.equal(getEvent(db, "b3")!.cost.registrationUrl, url);
});
