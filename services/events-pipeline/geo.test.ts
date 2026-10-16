import { test } from "node:test";
import assert from "node:assert/strict";
import { openEventsDb } from "./db";
import { areaKey, canonicalAreaKeyFromLegacy, createGeocoder, estimateDriveMinutes, geocodeHousehold, haversineKm, TRIP_DRIVE_LIMITS, tripTypeFor } from "./geo";

type Handler = (url: string) => unknown[] | Error;

function fakeFetch(handler: Handler) {
  const calls: Array<{ url: string; at: number; headers: Record<string, string>; hasSignal: boolean }> = [];
  const f = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, at: Date.now(), headers: init?.headers as Record<string, string>, hasSignal: !!init?.signal });
    const out = handler(url);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

const hit = [{ lat: "42.6977", lon: "23.3219" }];
const ua = "family-frame-test/1.0";

test("cache hit avoids fetch and request carries user agent", async () => {
  const { f, calls } = fakeFetch(() => hit);
  const g = createGeocoder({ db: openEventsDb(":memory:"), fetch: f, userAgent: ua, minIntervalMs: 0 });
  assert.deepEqual(await g.geocode("Sofia, Bulgaria"), { lat: 42.6977, lon: 23.3219 });
  assert.deepEqual(await g.geocode("  sofia,   BULGARIA "), { lat: 42.6977, lon: 23.3219 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers["User-Agent"], ua);
  assert.ok(calls[0].hasSignal);
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?format=jsonv2&limit=1&q=Sofia/);
});

test("fallback order: full, postal, city", async () => {
  const { f, calls } = fakeFetch((url) => (url.includes("q=Sofia%2C%20Bulgaria") ? hit : []));
  const g = createGeocoder({ db: openEventsDb(":memory:"), fetch: f, userAgent: ua, minIntervalMs: 0 });
  const res = await geocodeHousehold(g, { line1: "1 Vitosha Blvd", city: "Sofia", postalCode: "1000", country: "Bulgaria" });
  assert.equal(res?.level, "city");
  assert.equal(calls.length, 3);
  assert.ok(decodeURIComponent(calls[0].url).includes("1 Vitosha Blvd"));
  assert.ok(decodeURIComponent(calls[1].url).includes("q=1000, Sofia, Bulgaria"));
  assert.ok(decodeURIComponent(calls[2].url).endsWith("q=Sofia, Bulgaria"));
});

test("full address match stops early; no postal code skips that level", async () => {
  const { f, calls } = fakeFetch(() => hit);
  const g = createGeocoder({ db: openEventsDb(":memory:"), fetch: f, userAgent: ua, minIntervalMs: 0 });
  assert.equal((await geocodeHousehold(g, { line1: "1 A St", city: "Sofia", country: "Bulgaria" }))?.level, "full");
  assert.equal(calls.length, 1);
  const none = fakeFetch(() => []);
  const g2 = createGeocoder({ db: openEventsDb(":memory:"), fetch: none.f, userAgent: ua, minIntervalMs: 0 });
  assert.equal(await geocodeHousehold(g2, { line1: "1 A St", city: "Sofia", country: "Bulgaria" }), null);
  assert.equal(none.calls.length, 2);
});

test("calls are spaced by minIntervalMs", async () => {
  const { f, calls } = fakeFetch(() => hit);
  const g = createGeocoder({ db: openEventsDb(":memory:"), fetch: f, userAgent: ua, minIntervalMs: 120 });
  await Promise.all([g.geocode("a"), g.geocode("b"), g.geocode("c")]);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].at - calls[0].at >= 110, `gap ${calls[1].at - calls[0].at}`);
  assert.ok(calls[2].at - calls[1].at >= 110, `gap ${calls[2].at - calls[1].at}`);
});

test("network error and empty result give null and are not cached", async () => {
  let fail = true;
  const { f, calls } = fakeFetch(() => (fail ? new Error("boom") : hit));
  const g = createGeocoder({ db: openEventsDb(":memory:"), fetch: f, userAgent: ua, minIntervalMs: 0 });
  assert.equal(await g.geocode("Sofia"), null);
  fail = false;
  assert.deepEqual(await g.geocode("Sofia"), { lat: 42.6977, lon: 23.3219 });
  assert.equal(calls.length, 2);
});

test("haversine Sofia to Plovdiv is about 132 km", () => {
  const d = haversineKm({ lat: 42.6977, lon: 23.3219 }, { lat: 42.1354, lon: 24.7453 });
  assert.ok(Math.abs(d - 132) <= 3, `got ${d}`);
  assert.equal(haversineKm({ lat: 1, lon: 1 }, { lat: 1, lon: 1 }), 0);
});

test("areaKey lowercases and strips accents", () => {
  assert.equal(areaKey({ city: "  São  Paulo ", region: "SP", country: "Brasil" }), "sao paulo|brasil");
  assert.equal(areaKey({ city: "Plovdiv", country: "Bulgaria" }), "plovdiv|bg");
});

test("areaKey is canonical across spellings of one city", () => {
  assert.equal(areaKey({ city: "Santa Clara, CA", region: "CA", country: "USA" }), "santa clara|us");
  assert.equal(areaKey({ city: "Santa Clara", region: "", country: "US" }), "santa clara|us");
  assert.equal(areaKey({ city: "Santa Clara", region: "California", country: "United States" }), "santa clara|us");
  assert.equal(areaKey({ city: "Santa Clara, California", region: "", country: "U.S.A." }), "santa clara|us");
  assert.equal(areaKey({ city: "Woodinville", region: "Washington", country: "US" }), "woodinville|us");
  assert.equal(areaKey({ city: "London", region: "", country: "England" }), "london|gb");
});

test("canonicalAreaKeyFromLegacy converts legacy and canonical keys", () => {
  assert.equal(canonicalAreaKeyFromLegacy("santa clara, ca|ca|usa"), "santa clara|us");
  assert.equal(canonicalAreaKeyFromLegacy("santa clara|ca|usa"), "santa clara|us");
  assert.equal(canonicalAreaKeyFromLegacy("santa clara||us"), "santa clara|us");
  assert.equal(canonicalAreaKeyFromLegacy("santa clara|us"), "santa clara|us");
  assert.equal(canonicalAreaKeyFromLegacy("plovdiv||bulgaria"), "plovdiv|bg");
});

test("estimateDriveMinutes adds overhead and road factor; bad input is 0", () => {
  assert.equal(estimateDriveMinutes(0), 10);
  assert.equal(estimateDriveMinutes(30), 45);
  assert.equal(estimateDriveMinutes(100), 125);
  assert.equal(estimateDriveMinutes(120), 148);
  assert.equal(estimateDriveMinutes(NaN), 0);
  assert.equal(estimateDriveMinutes(Infinity), 0);
  assert.equal(estimateDriveMinutes(-5), 0);
});

test("tripTypeFor classifies drive minutes", () => {
  assert.deepEqual(TRIP_DRIVE_LIMITS, { local: 45, dayTrip: 90, weekend: 150 });
  assert.equal(tripTypeFor(estimateDriveMinutes(20)), "local");
  assert.equal(tripTypeFor(44), "local");
  assert.equal(tripTypeFor(estimateDriveMinutes(30)), "day-trip");
  assert.equal(tripTypeFor(89), "day-trip");
  assert.equal(tripTypeFor(90), "weekend");
  assert.equal(tripTypeFor(estimateDriveMinutes(100)), "weekend");
  assert.equal(tripTypeFor(estimateDriveMinutes(120)), "weekend");
  assert.equal(tripTypeFor(150), null);
  assert.equal(tripTypeFor(estimateDriveMinutes(200)), null);
});
