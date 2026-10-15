import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ffEventSchema,
  recommendationInputSchema,
  putRecommendationsSchema,
  postFeedbackSchema,
  eventPreferencesSchema,
  patchPlanSchema,
  postResponseSchema,
  EVENTS_LIMITS,
  SAMPLE_EVENT,
  SAMPLE_RECOMMENDATION_INPUT,
} from "../shared/events";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test("samples parse", () => {
  assert.equal(ffEventSchema.safeParse(SAMPLE_EVENT).success, true);
  assert.equal(recommendationInputSchema.safeParse(SAMPLE_RECOMMENDATION_INPUT).success, true);
  assert.equal(SAMPLE_EVENT.schedule.occurrences.length, 2);
  assert.equal(SAMPLE_EVENT.sources.length, 2);
});

test("rejects http source url", () => {
  const e = clone(SAMPLE_EVENT);
  e.sources[0].url = "http://example.com/x";
  assert.equal(ffEventSchema.safeParse(e).success, false);
});

test("rejects unknown keys at top level and in cost", () => {
  assert.equal(ffEventSchema.safeParse({ ...clone(SAMPLE_EVENT), extra: 1 }).success, false);
  const e = clone(SAMPLE_EVENT) as any;
  e.cost.extra = true;
  assert.equal(ffEventSchema.safeParse(e).success, false);
});

test("rejects end before start", () => {
  const e = clone(SAMPLE_EVENT);
  e.schedule.end = "2026-10-24T09:00:00-07:00";
  assert.equal(ffEventSchema.safeParse(e).success, false);
});

test("sources limited to 10", () => {
  const e = clone(SAMPLE_EVENT);
  e.sources = Array.from({ length: 11 }, () => clone(SAMPLE_EVENT.sources[0]));
  assert.equal(ffEventSchema.safeParse(e).success, false);
  e.sources = [];
  assert.equal(ffEventSchema.safeParse(e).success, false);
});

test("putRecommendationsSchema batch limit", () => {
  const mk = (n: number) => ({
    runId: "run-1",
    recommendations: Array.from({ length: n }, () => clone(SAMPLE_RECOMMENDATION_INPUT)),
  });
  assert.equal(putRecommendationsSchema.safeParse(mk(EVENTS_LIMITS.maxBatch)).success, true);
  assert.equal(putRecommendationsSchema.safeParse(mk(51)).success, false);
});

test("postFeedbackSchema rejects unknown signal", () => {
  assert.equal(postFeedbackSchema.safeParse({ signal: "liked" }).success, true);
  assert.equal(postFeedbackSchema.safeParse({ signal: "meh" }).success, false);
});

test("preferences default and patchPlan needs a key", () => {
  const p = eventPreferencesSchema.parse({});
  assert.equal(p.maxDistanceKm, 30);
  assert.equal(p.budget, "any");
  assert.equal(patchPlanSchema.safeParse({}).success, false);
  assert.equal(patchPlanSchema.safeParse({ notes: "x" }).success, true);
});

const goodVisit = { start: "2026-10-24T11:00", end: "2026-10-24T13:30" };

test("visit accepted on postResponseSchema and patchPlanSchema", () => {
  assert.equal(postResponseSchema.safeParse({ response: "going", visit: goodVisit }).success, true);
  assert.equal(patchPlanSchema.safeParse({ visit: goodVisit }).success, true);
  assert.equal(
    patchPlanSchema.safeParse({ visit: { start: "2026-10-24T11:00:00", end: "2026-10-24T13:00:00" } }).success,
    true,
  );
});

test("visit rejects bad windows", () => {
  const bad = [
    { start: "2026-10-24T11:00", end: "2026-10-25T01:00" },
    { start: "2026-10-24T11:00", end: "2026-10-24T11:00" },
    { start: "2026-10-24T11:00", end: "2026-10-24T10:00" },
    { start: "2026-10-24T08:00", end: "2026-10-24T20:01" },
    { start: "2026-10-24T11:00Z", end: "2026-10-24T13:00Z" },
    { start: "2026-10-24T11:00", end: "2026-10-24T13:00+02:00" },
    { start: "2026-10-24T11:00", end: "2026-10-24T13:00", extra: 1 },
  ];
  for (const visit of bad) {
    assert.equal(postResponseSchema.safeParse({ response: "going", visit }).success, false, JSON.stringify(visit));
    assert.equal(patchPlanSchema.safeParse({ visit }).success, false, JSON.stringify(visit));
  }
});

test("visit allows exactly 12 hours", () => {
  assert.equal(
    patchPlanSchema.safeParse({ visit: { start: "2026-10-24T08:00", end: "2026-10-24T20:00" } }).success,
    true,
  );
});

test("visit preferences default and validate", () => {
  const p = eventPreferencesSchema.parse({});
  assert.equal(p.visitBlockMinutes, 150);
  assert.equal(p.visitEarliest, "10:00");
  assert.equal(p.visitLatestEnd, "18:00");
  assert.equal(eventPreferencesSchema.safeParse({ visitBlockMinutes: 30 }).success, false);
  assert.equal(eventPreferencesSchema.safeParse({ visitBlockMinutes: 300 }).success, false);
  assert.equal(eventPreferencesSchema.safeParse({ visitBlockMinutes: 90.5 }).success, false);
  assert.equal(eventPreferencesSchema.safeParse({ visitEarliest: "25:00" }).success, false);
  assert.equal(eventPreferencesSchema.safeParse({ visitLatestEnd: "9:00" }).success, false);
});
