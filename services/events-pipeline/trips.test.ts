import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendationInputSchema } from "../../shared/events";
import type { HaikuRunner } from "./haiku";
import { TRIP_JSON_SCHEMA, buildTripPrompt, nextTripDates, parseTripResult, planTrip } from "./trips";
import type { TripParseContext, TripPromptInput } from "./trips";

const tz = "America/Los_Angeles";
const now = new Date("2026-10-15T19:00:00Z"); // Thursday
const home = { lat: 45.52, lon: -122.68, timezone: tz };

const promptInput = (over: Partial<TripPromptInput> = {}): TripPromptInput => ({
  type: "weekend",
  area: { city: "Portland", region: "Oregon", country: "United States" },
  memberAges: [38, 36, 4],
  likedCategories: ["nature-animals"],
  avoidedCategories: ["faith-church"],
  existingTripTitles: ["Cannon Beach weekend"],
  maxTicketPrice: 80,
  ...over,
});
const ctx = (type: "day-trip" | "weekend", household: TripParseContext["household"] = home): TripParseContext => ({ type, household, now });

const itinerary = [{ label: "Day 1", items: [{ time: "09:00", title: "Drive to Hood River", kind: "drive" }] }];
const lodging = [
  { name: "River Inn", area: "Hood River", priceText: "$150-190/night", url: "https://example.com/inn" },
  { name: "Cabin", area: "Odell", priceText: "$120/night", url: "https://example.com/cabin" },
];
// Hood River is about 100 km from Portland (about 1 hour).
const result = (over: Record<string, unknown> = {}) => ({
  destination: { name: "Hood River", city: "Hood River", region: "Oregon", country: "United States", lat: 45.7054, lon: -121.5215 },
  title: "Hood River weekend",
  summary: "Orchards and the Columbia Gorge.",
  description: "Two days of orchards, waterfalls and a train ride.",
  category: "nature-animals",
  driveMinutesEstimate: 70,
  nights: 1,
  itinerary,
  lodging,
  priceText: "$300-450 total",
  sources: ["https://example.com/hood-river"],
  whyForHousehold: "Easy outdoor fun for a preschooler.",
  highlights: ["Waterfalls"],
  tips: ["Book lodging early"],
  ...over,
});

test("prompt has place, limit, profile and no address or coordinates", () => {
  const p = buildTripPrompt(promptInput());
  assert.match(p, /Portland, Oregon, United States/);
  assert.match(p, /under 150 minutes/);
  assert.match(p, /nature-animals/);
  assert.match(p, /faith-church/);
  assert.match(p, /Cannon Beach weekend/);
  assert.match(p, /research only, do not book/i);
  assert.match(p, /Household:/);
  assert.match(buildTripPrompt(promptInput({ type: "day-trip" })), /under 90 minutes/);
  assert.doesNotMatch(p, /45\.52|-122\.68|Street|\bSt\b/);
});

test("valid weekend result -> schema-valid rec", () => {
  const rec = parseTripResult(result(), ctx("weekend"));
  assert.ok(rec);
  assert.ok(recommendationInputSchema.safeParse(rec).success);
  assert.equal(rec.tripType, "weekend");
  assert.ok(rec.trip && rec.trip.nights >= 1);
  assert.ok(rec.trip.lodging.length >= 1 && rec.trip.lodging.length <= 3);
  assert.equal(rec.event.schedule.recurrenceText, "Any weekend");
  assert.equal(rec.event.schedule.start, "2026-10-17");
  assert.equal(rec.event.schedule.end, "2026-10-18");
  assert.equal(rec.matchScore, 0.6);
  assert.equal(rec.event.sources[0].url, "https://example.com/hood-river");
  const again = parseTripResult(result(), { ...ctx("weekend"), now: new Date("2026-10-20T19:00:00Z") });
  assert.equal(again?.event.id, rec.event.id);
});

test("day trip too far -> null", () => {
  const far = result({
    destination: { name: "Seattle", city: "Seattle", country: "United States", lat: 47.6, lon: -122.33 },
    nights: 0,
    lodging: [],
  });
  assert.equal(parseTripResult(far, ctx("day-trip")), null);
});

test("no household coords: trust estimate but cap to limit", () => {
  const rec = parseTripResult(result({ driveMinutesEstimate: 400, nights: 0, lodging: [] }), ctx("day-trip", { timezone: tz }));
  assert.equal(rec?.driveMinutes, 90);
});

test("malformed output -> null", () => {
  assert.equal(parseTripResult(null, ctx("weekend")), null);
  assert.equal(parseTripResult({ foo: 1 }, ctx("weekend")), null);
  assert.equal(parseTripResult(result({ lodging: [] }), ctx("weekend")), null);
  assert.equal(parseTripResult(result({ sources: ["http://insecure.example.com"] }), ctx("weekend")), null);
});

test("nextTripDates on Friday, Saturday and Sunday", () => {
  const at = (iso: string) => new Date(iso);
  assert.deepEqual(nextTripDates("day-trip", at("2026-10-16T18:00:00Z"), tz), { start: "2026-10-17", end: "2026-10-17" });
  assert.deepEqual(nextTripDates("weekend", at("2026-10-17T18:00:00Z"), tz), { start: "2026-10-24", end: "2026-10-25" });
  assert.deepEqual(nextTripDates("weekend", at("2026-10-18T18:00:00Z"), tz), { start: "2026-10-24", end: "2026-10-25" });
  // 2026-10-18 02:00Z is still Saturday evening in Los Angeles.
  assert.deepEqual(nextTripDates("day-trip", at("2026-10-18T02:00:00Z"), tz), { start: "2026-10-24", end: "2026-10-24" });
});

test("planTrip ok and runner failure", async () => {
  let seen: unknown;
  const ok: HaikuRunner = {
    run: async (i) => {
      seen = i.jsonSchema;
      return { ok: true, data: result() };
    },
  };
  const good = await planTrip(ok, promptInput(), ctx("weekend"));
  assert.equal(good.ok, true);
  assert.equal(seen, TRIP_JSON_SCHEMA);
  const bad = await planTrip({ run: async () => ({ ok: false, reason: "timeout", detail: "slow" }) }, promptInput(), ctx("weekend"));
  assert.equal(bad.ok, false);
  const junk = await planTrip({ run: async () => ({ ok: true, data: { x: 1 } }) }, promptInput(), ctx("weekend"));
  assert.equal(junk.ok, false);
});
