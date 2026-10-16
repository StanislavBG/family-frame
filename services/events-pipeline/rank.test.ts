import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_CATEGORIES, SAMPLE_EVENT, eventPreferencesSchema } from "../../shared/events";
import type { EventCategory, FfEvent } from "../../shared/events";
import type { PreferenceSummary } from "../../shared/events-preferences";
import { rankForHousehold, type RankInput } from "./rank";

const now = new Date("2026-10-10T12:00:00-07:00");

function learnedWith(over: Partial<Record<EventCategory, number>> = {}): PreferenceSummary {
  const categoryWeights = {} as Record<EventCategory, number>;
  for (const c of EVENT_CATEGORIES) categoryWeights[c] = over[c] ?? 0;
  return {
    categoryWeights,
    tagWeights: {},
    freePreference: 0,
    maxDistanceKm: 30,
    preferredWeekdays: [],
    signalsCount: 0,
    lines: [],
  };
}

let seq = 0;
function ev(daysAhead: number, over: Partial<FfEvent> = {}): FfEvent {
  seq += 1;
  const e = structuredClone(SAMPLE_EVENT);
  const day = new Date(now.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 10);
  e.id = `e${seq}`;
  e.fingerprint = `fp${seq}`;
  e.title = `Unique${seq} Gathering${seq}`;
  e.category = "kids-activities";
  e.status = "scheduled";
  e.schedule = {
    timezone: "UTC",
    start: `${day}T10:00:00Z`,
    end: `${day}T12:00:00Z`,
    allDay: false,
    occurrences: [],
  };
  e.location = { ...e.location, lat: undefined, lon: undefined };
  e.cost = { ...e.cost, isFree: true, ticketRequired: false, registrationRequired: false };
  e.audience = { ...e.audience, ageBands: ["all-ages"], ageMin: undefined, ageMax: undefined };
  return { ...e, ...over };
}

function input(events: FfEvent[], over: Partial<RankInput> = {}, prefs: Record<string, unknown> = {}): RankInput {
  return {
    events,
    household: {
      lat: 45.5,
      lon: -122.6,
      memberAges: [38, 36, 5],
      preferences: eventPreferencesSchema.parse(prefs),
      learned: learnedWith(),
    },
    state: { knownEventIds: [], knownFingerprints: [], busy: [] },
    now,
    ...over,
  };
}

const reasonOf = (r: ReturnType<typeof rankForHousehold>, e: FfEvent) =>
  r.skipped.find((s) => s.eventId === e.id)?.reason;

test("skips events already known by id or fingerprint", () => {
  const a = ev(3);
  const b = ev(4);
  const r = rankForHousehold(
    input([a, b], { state: { knownEventIds: [a.id], knownFingerprints: [b.fingerprint], busy: [] } }),
  );
  assert.equal(r.picks.length, 0);
  assert.match(reasonOf(r, a) ?? "", /known/);
  assert.match(reasonOf(r, b) ?? "", /known/);
});

test("skips cancelled, ended, past and beyond-horizon events", () => {
  const cancelled = ev(3, { status: "cancelled" });
  const ended = ev(3, { status: "ended" });
  const past = ev(-5);
  const far = ev(120);
  const r = rankForHousehold(input([cancelled, ended, past, far]));
  assert.equal(r.picks.length, 0);
  assert.match(reasonOf(r, cancelled) ?? "", /cancelled/);
  assert.match(reasonOf(r, ended) ?? "", /ended/);
  assert.match(reasonOf(r, past) ?? "", /over/);
  assert.match(reasonOf(r, far) ?? "", /horizon/);
});

test("skips events beyond max distance only when both coordinates exist", () => {
  const farAway = ev(3);
  farAway.location.lat = 47.6;
  farAway.location.lon = -122.3;
  const noCoords = ev(3, { category: "arts-culture" });
  const near = ev(3, { category: "sports-fitness" });
  near.location.lat = 45.52;
  near.location.lon = -122.61;
  const r = rankForHousehold(input([farAway, noCoords, near], {}, { maxDistanceKm: 30 }));
  assert.match(reasonOf(r, farAway) ?? "", /distance/);
  const ids = r.picks.map((p) => p.event.id);
  assert.ok(ids.includes(noCoords.id) && ids.includes(near.id));
  assert.ok((r.picks.find((p) => p.event.id === near.id)?.distanceKm ?? 99) < 5);
  const noHome = rankForHousehold(
    input([farAway], { household: { ...input([]).household, lat: undefined, lon: undefined } }),
  );
  assert.equal(noHome.picks.length, 1);
});

test("skips avoided categories", () => {
  const e = ev(3, { category: "sports-fitness" });
  const r = rankForHousehold(input([e], {}, { avoidedCategories: ["sports-fitness"] }));
  assert.match(reasonOf(r, e) ?? "", /avoided/);
});

test("free budget skips paid events", () => {
  const paid = ev(3);
  paid.cost.isFree = false;
  const free = ev(3);
  const r = rankForHousehold(input([paid, free], {}, { budget: "free" }));
  assert.match(reasonOf(r, paid) ?? "", /budget/);
  assert.deepEqual(r.picks.map((p) => p.event.id), [free.id]);
});

test("age filters use oldest member for ageMin and youngest child for ageMax", () => {
  const tooOld = ev(3);
  tooOld.audience.ageMin = 40;
  const tooYoung = ev(3);
  tooYoung.audience.ageMax = 3;
  const fine = ev(3);
  fine.audience.ageMin = 4;
  fine.audience.ageMax = 10;
  const r = rankForHousehold(input([tooOld, tooYoung, fine]));
  assert.ok(reasonOf(r, tooOld));
  assert.ok(reasonOf(r, tooYoung));
  assert.deepEqual(r.picks.map((p) => p.event.id), [fine.id]);
  // Adults only: ageMax below a child's age is irrelevant.
  const adults = rankForHousehold(
    input([tooYoung], { household: { ...input([]).household, memberAges: [40, 38] } }),
  );
  assert.equal(adults.picks.length, 1);
});

test("busy intervals clash; all-day blocks only when flagged busy-all-day", () => {
  const e = ev(3);
  const day = e.schedule.start.slice(0, 10);
  const timed = { start: `${day}T11:00:00Z`, end: `${day}T13:00:00Z` };
  const adjacent = { start: `${day}T12:00:00Z`, end: `${day}T13:00:00Z` };
  const allDayPlain = { start: day, end: day, allDay: true };
  const allDayBusy = { start: day, end: day, allDay: true, busyAllDay: true };
  const run = (busy: RankInput["state"]["busy"]) =>
    rankForHousehold(input([e], { state: { knownEventIds: [], knownFingerprints: [], busy } }));
  assert.equal(run([timed]).picks.length, 0);
  assert.match(reasonOf(run([timed]), e) ?? "", /calendar/);
  assert.equal(run([adjacent]).picks.length, 1);
  assert.equal(run([allDayPlain]).picks.length, 1);
  assert.equal(run([allDayBusy]).picks.length, 0);
});

test("caps focus and later windows", () => {
  const focus = Array.from({ length: 12 }, (_, i) => ev(1 + (i % 10), { category: EVENT_CATEGORIES[i] }));
  const later = Array.from({ length: 16 }, (_, i) => ev(20 + i, { category: EVENT_CATEGORIES[i % 15] }));
  const r = rankForHousehold(input([...focus, ...later]));
  const focusIds = new Set(focus.map((e) => e.id));
  const nFocus = r.picks.filter((p) => focusIds.has(p.event.id)).length;
  assert.equal(nFocus, 12);
  assert.equal(r.picks.length - nFocus, 16);
  const small = rankForHousehold(input([...focus, ...later], { limits: { maxFocus: 2, maxLater: 1 } }));
  assert.equal(small.picks.length, 3);
});

test("variety cap: 3 per category in the later window, 1 per day in focus; no shared fingerprints", () => {
  const same = Array.from({ length: 6 }, (_, i) => ev(20 + i));
  const dupA = ev(2, { category: "arts-culture" });
  const dupB = ev(3, { category: "arts-culture", fingerprint: dupA.fingerprint });
  const r = rankForHousehold(input([...same, dupA, dupB], { limits: { laterPerDayMax: 3 } }));
  assert.equal(r.picks.filter((p) => p.event.category === "kids-activities").length, 3);
  assert.equal(r.picks.filter((p) => p.event.fingerprint === dupA.fingerprint).length, 1);
  assert.ok(reasonOf(r, same[5]));
});

test("per-day cap: 5 good events on one day give 3 picks + 2 day full", () => {
  const day = Array.from({ length: 5 }, (_, i) => ev(3, { category: EVENT_CATEGORIES[i] }));
  const r = rankForHousehold(input(day));
  assert.equal(r.picks.length, 3);
  assert.equal(r.skipped.filter((s) => s.reason === "day full").length, 2);
});

test("known items count toward their day's cap", () => {
  const day = Array.from({ length: 5 }, (_, i) => ev(3, { category: EVENT_CATEGORIES[i] }));
  const known = [{ title: "Something else entirely", start: day[0].schedule.start }];
  const r = rankForHousehold(
    input(day, { state: { knownEventIds: [], knownFingerprints: [], busy: [], known } }),
  );
  assert.equal(r.picks.length, 2);
});

test("same series on different days gives one pick", () => {
  const a = ev(3, { title: "Día de Muertos Festival", category: "arts-culture" });
  const b = ev(6, { title: "Dia de Muertos Festival", category: "festivals-fairs" });
  const r = rankForHousehold(input([a, b]));
  assert.equal(r.picks.length, 1);
  assert.match(reasonOf(r, r.picks[0].event.id === a.id ? b : a) ?? "", /same series as a higher-ranked pick/);
});

test("a known title blocks a similar candidate", () => {
  const c = ev(3, { title: "Día de Muertos Festival" });
  const known = [{ title: "Festival Día de Muertos", start: ev(9).schedule.start }];
  const r = rankForHousehold(
    input([c], { state: { knownEventIds: [], knownFingerprints: [], busy: [], known } }),
  );
  assert.equal(r.picks.length, 0);
  assert.match(reasonOf(r, c) ?? "", /same series as a known recommendation/);
});

test("two same-category events on one focus day give one pick", () => {
  const a = ev(3);
  const b = ev(3);
  const r = rankForHousehold(input([a, b]));
  assert.equal(r.picks.length, 1);
  assert.equal(r.skipped.find((s) => s.eventId !== r.picks[0].event.id)?.reason, "category variety cap");
});

test("less-like-this category ranks below a liked one", () => {
  const liked = ev(5, { category: "arts-culture" });
  const disliked = ev(5, { category: "sports-fitness" });
  const r = rankForHousehold(
    input([disliked, liked], {
      household: {
        ...input([]).household,
        learned: learnedWith({ "arts-culture": 0.8, "sports-fitness": -0.9 }),
      },
    }),
  );
  assert.deepEqual(r.picks.map((p) => p.event.id), [liked.id, disliked.id]);
  assert.ok(r.picks[0].score > r.picks[1].score);
});

test("focus bonus, score range, and 1-5 plain-English reasons", () => {
  const soon = ev(3);
  const later = ev(30);
  const r = rankForHousehold(input([later, soon]));
  assert.equal(r.picks[0].event.id, soon.id);
  for (const p of r.picks) {
    assert.ok(p.score >= 0 && p.score <= 1.1);
    assert.ok(p.matchReasons.length >= 1 && p.matchReasons.length <= 5);
  }
});

test("ticketed events: over limit skipped, within limit kept under free budget, paid-entry still skipped", () => {
  const over = ev(3);
  over.cost = { ...over.cost, isFree: false, admission: "ticketed", ticketRequired: true, minPrice: 600, currency: "USD" };
  const within = ev(3);
  within.cost = { ...within.cost, isFree: false, admission: "ticketed", ticketRequired: true, minPrice: 40, currency: "USD" };
  const noPrice = ev(3, { category: "music-performance" });
  noPrice.cost = { ...noPrice.cost, isFree: false, ticketRequired: true, minPrice: undefined, maxPrice: undefined };
  const paidEntry = ev(3);
  paidEntry.cost = { ...paidEntry.cost, isFree: false, admission: "paid-entry", ticketRequired: false, minPrice: 10 };
  const r = rankForHousehold(input([over, within, noPrice, paidEntry], {}, { budget: "free" }));
  assert.equal(reasonOf(r, over), "over ticket price limit");
  assert.match(reasonOf(r, paidEntry) ?? "", /budget/);
  const ids = r.picks.map((p) => p.event.id).sort();
  assert.deepEqual(ids, [within.id, noPrice.id].sort());
  const reasons = (e: FfEvent) => r.picks.find((p) => p.event.id === e.id)!.matchReasons;
  assert.ok(reasons(within).includes("Ticketed show, from USD 40"));
  assert.ok(reasons(noPrice).includes("Ticketed show"));
});
