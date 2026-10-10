import { test } from "node:test";
import assert from "node:assert/strict";
import { ffEventSchema } from "../../shared/events";
import { fingerprint, isNearDuplicate, mergeDuplicate, normalizeCandidate, rawCandidateSchema } from "./normalize";

const now = new Date("2026-10-10T12:00:00Z");
const opts = { now, defaultTimezone: "America/Los_Angeles" };

const base = {
  title: "Riverside Family Pumpkin Festival",
  description: "Pumpkin patch, hayrides and a costume parade.",
  start: "2026-10-24T10:00:00-07:00",
  city: "Portland",
  country: "United States",
  category: "holiday-seasonal",
  sourceUrls: ["https://riversidefarm.example/festival"],
};

function ok(raw: unknown) {
  const r = normalizeCandidate(raw, opts);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.event;
}

test("valid candidate normalizes and parses with ffEventSchema", () => {
  const e = ok(base);
  assert.equal(ffEventSchema.safeParse(e).success, true);
  assert.match(e.id, /^evt_[0-9a-f]{20}$/);
  assert.equal(e.status, "scheduled");
  assert.deepEqual(e.audience.ageBands, ["all-ages"]);
  assert.equal(e.location.setting, "unknown");
});

test("unknown category maps to other", () => {
  assert.equal(ok({ ...base, category: "bungee" }).category, "other");
});

test("http URL rejected", () => {
  const r = normalizeCandidate({ ...base, sourceUrls: ["http://x.example/a"] }, opts);
  assert.equal(r.ok, false);
  assert.equal(rawCandidateSchema.safeParse({ ...base, ticketUrl: "http://x.example" }).success, false);
});

test("past and too-far-ahead starts rejected", () => {
  assert.equal(normalizeCandidate({ ...base, start: "2026-10-01T10:00:00-07:00" }, opts).ok, false);
  assert.equal(normalizeCandidate({ ...base, start: "2027-03-01T10:00:00-08:00" }, opts).ok, false);
});

test("HTML and control characters stripped", () => {
  const e = ok({ ...base, title: "<b>Pumpkin</b> Fest\u0007ival", description: "<script>alert(1)</script>Fun <i>day</i>" });
  assert.equal(e.title, "Pumpkin Fest ival");
  assert.equal(e.description, "Fun day");
});

test("accents and case give the same fingerprint", () => {
  const a = ok({ ...base, title: "Café Concert", city: "Montréal" });
  const b = ok({ ...base, title: "CAFE concert!", city: "montreal" });
  assert.equal(fingerprint(a), fingerprint(b));
  assert.equal(a.id, b.id);
});

test("near-duplicate merge unions sources", () => {
  const a = ok(base);
  const b = ok({
    ...base,
    title: "Family Pumpkin Festival at Riverside",
    sourceUrls: ["https://other.example/p", "https://riversidefarm.example/festival"],
    minPrice: 0,
    priceText: "Free entry",
    address: "1200 River Road",
  });
  assert.equal(isNearDuplicate(a, b), true);
  const m = mergeDuplicate(a, b);
  assert.equal(m.sources.length, 2);
  assert.equal(m.id, a.id);
  assert.equal(m.cost.priceText, "Free entry");
  assert.equal(m.location.address, "1200 River Road");
  assert.equal(ffEventSchema.safeParse(m).success, true);
  assert.equal(isNearDuplicate(a, ok({ ...base, title: "Jazz Night", start: "2026-10-25T10:00:00-07:00" })), false);
});
