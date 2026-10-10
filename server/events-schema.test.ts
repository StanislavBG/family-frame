import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ffEventSchema,
  recommendationInputSchema,
  putRecommendationsSchema,
  postFeedbackSchema,
  eventPreferencesSchema,
  patchPlanSchema,
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
