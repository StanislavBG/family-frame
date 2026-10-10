import { test } from "node:test";
import assert from "node:assert/strict";
import { openEventsDb } from "./db";
import { areaKey, createGeocoder, geocodeHousehold, haversineKm } from "./geo";

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
  assert.equal(areaKey({ city: "  São  Paulo ", region: "SP", country: "Brasil" }), "sao paulo|sp|brasil");
  assert.equal(areaKey({ city: "Plovdiv", country: "Bulgaria" }), "plovdiv||bulgaria");
});
