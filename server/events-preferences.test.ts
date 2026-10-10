import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregatePreferences } from "../shared/events-preferences";
import { EVENT_CATEGORIES, eventPreferencesSchema } from "../shared/events";
import type { EventCategory, FeedbackEntry } from "../shared/events";

const NOW = new Date("2026-10-10T12:00:00Z");
const stated = eventPreferencesSchema.parse({});

let counter = 0;
function entry(
  signal: FeedbackEntry["signal"],
  category: EventCategory,
  daysAgo = 0,
  extra: Partial<FeedbackEntry["snapshot"]> = {},
): FeedbackEntry {
  counter += 1;
  return {
    id: `f${counter}`,
    at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    eventId: `e${counter}`,
    signal,
    snapshot: {
      title: "Event",
      category,
      tags: [],
      isFree: true,
      weekday: 6,
      ageBands: ["all-ages"],
      ...extra,
    },
  };
}

test("empty log gives zero weights", () => {
  const s = aggregatePreferences([], stated, { now: NOW });
  for (const c of EVENT_CATEGORIES) assert.equal(s.categoryWeights[c], 0);
  assert.deepEqual(s.tagWeights, {});
  assert.equal(s.freePreference, 0);
  assert.equal(s.signalsCount, 0);
  assert.deepEqual(s.preferredWeekdays, []);
  assert.equal(s.maxDistanceKm, stated.maxDistanceKm);
});

test("liked + more-like-this beats a single disliked", () => {
  const s = aggregatePreferences(
    [entry("liked", "festivals-fairs"), entry("more-like-this", "festivals-fairs"), entry("disliked", "arts-culture")],
    stated,
    { now: NOW },
  );
  assert.ok(s.categoryWeights["festivals-fairs"] > 0);
  assert.ok(s.categoryWeights["arts-culture"] < 0);
  assert.ok(s.categoryWeights["festivals-fairs"] > Math.abs(s.categoryWeights["arts-culture"]));
  for (const c of EVENT_CATEGORIES) assert.ok(Math.abs(s.categoryWeights[c]) <= 1);
});

test("avoided category stays -1 despite likes", () => {
  const s = aggregatePreferences(
    [entry("liked", "faith-church"), entry("more-like-this", "faith-church")],
    { ...stated, avoidedCategories: ["faith-church"], likedCategories: ["faith-church"] },
    { now: NOW },
  );
  assert.equal(s.categoryWeights["faith-church"], -1);
});

test("stated liked categories add a bonus", () => {
  const s = aggregatePreferences([], { ...stated, likedCategories: ["parks-outdoors"] }, { now: NOW });
  assert.equal(s.categoryWeights["parks-outdoors"], 0.6);
});

test("decay halves an entry's weight after 120 days", () => {
  const fresh = aggregatePreferences([entry("liked", "arts-culture", 0)], stated, { now: NOW });
  const old = aggregatePreferences([entry("liked", "arts-culture", 120)], stated, { now: NOW });
  const raw = (w: number) => Math.atanh(w) * 3;
  assert.ok(Math.abs(raw(old.categoryWeights["arts-culture"]) - raw(fresh.categoryWeights["arts-culture"]) / 2) < 1e-9);
});

test("lines mention a liked category", () => {
  const s = aggregatePreferences(
    [entry("liked", "parks-outdoors"), entry("more-like-this", "parks-outdoors")],
    stated,
    { now: NOW },
  );
  assert.ok(s.lines.length <= 6);
  assert.ok(s.lines.some((l) => l.startsWith("Likes:") && l.includes("parks & outdoors")));
});

test("tags are capped at 30, free preference and weekdays follow positive signals", () => {
  const tags = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const s = aggregatePreferences(
    [entry("liked", "kids-activities", 0, { tags, isFree: false, weekday: 0 }), entry("disliked", "other", 0, { weekday: 3 })],
    stated,
    { now: NOW },
  );
  assert.equal(Object.keys(s.tagWeights).length, 30);
  assert.equal(s.freePreference, -1);
  assert.deepEqual(s.preferredWeekdays, [0]);
});
