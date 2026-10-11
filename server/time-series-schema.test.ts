import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERIES_ID_PATTERN,
  TAG_PATTERN,
  TS_LIMITS,
  putSeriesSchema,
  timePointSchema,
  putPointsSchema,
  pointKey,
  pointTimeMs,
} from "../shared/time-series";

test("constants: patterns and limits", () => {
  assert.equal(SERIES_ID_PATTERN.test("electric-bill"), true);
  assert.equal(SERIES_ID_PATTERN.test("-bad"), false);
  assert.equal(SERIES_ID_PATTERN.test("Upper"), false);
  assert.equal(SERIES_ID_PATTERN.test("a".repeat(65)), false);
  assert.equal(TAG_PATTERN.test("utilities"), true);
  assert.equal(TAG_PATTERN.test("a".repeat(33)), false);
  assert.equal(TAG_PATTERN.test("has space"), false);
  assert.deepEqual(TS_LIMITS, {
    seriesPerUserMax: 200,
    tagsMax: 10,
    titleMax: 120,
    descriptionMax: 2000,
    summaryMax: 4000,
    unitMax: 24,
    labelMax: 200,
    annotationsBytesMax: 16384,
    pointAnnotationsBytesMax: 2048,
    pointsPerSeriesMax: 5000,
    batchMax: 500,
    pointsListDefault: 1000,
    pointsListMax: 5000,
  });
});

test("putSeriesSchema: accepts minimal and full input", () => {
  assert.equal(putSeriesSchema.safeParse({ title: "Electric" }).success, true);
  const r = putSeriesSchema.safeParse({
    title: " Electric ",
    description: "d",
    summary: "s",
    tags: ["utilities"],
    unit: "USD",
    color: "#aabbcc",
    annotations: { vendor: "PG&E", nested: { a: 1 } },
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.title, "Electric");
});

test("putSeriesSchema: normalizes tags (trim, lowercase, dedupe)", () => {
  const r = putSeriesSchema.parse({ title: "t", tags: [" Utilities ", "utilities", "Power"] });
  assert.deepEqual(r.tags, ["utilities", "power"]);
  assert.deepEqual(putSeriesSchema.parse({ title: "t" }).tags, []);
});

test("putSeriesSchema: rejects bad input", () => {
  assert.equal(putSeriesSchema.safeParse({ title: "" }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", extra: 1 }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", tags: ["bad tag"] }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", tags: ["-x"] }).success, false);
  const many = Array.from({ length: TS_LIMITS.tagsMax + 1 }, (_, i) => `t${i}`);
  assert.equal(putSeriesSchema.safeParse({ title: "t", tags: many }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", color: "red" }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", color: "#abc" }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", annotations: [1] }).success, false);
  assert.equal(putSeriesSchema.safeParse({ title: "t", annotations: null }).success, false);
  assert.equal(
    putSeriesSchema.safeParse({ title: "t", annotations: { big: "x".repeat(TS_LIMITS.annotationsBytesMax) } }).success,
    false,
  );
});

test("timePointSchema: accepts dates and datetimes", () => {
  for (const t of ["2026-01-15", "2026-01-15T10:00Z", "2026-01-15T10:00:00Z", "2026-01-15T10:00:00.123+02:00"]) {
    assert.equal(timePointSchema.safeParse({ t, value: 12.5 }).success, true, t);
  }
  assert.equal(
    timePointSchema.safeParse({ t: "2026-01-15", value: 0, label: "Jan", annotations: { a: 1 } }).success,
    true,
  );
});

test("timePointSchema: rejects bad t, value and annotations", () => {
  for (const t of ["2026-02-30", "2026-01-15T10:00:00", "yesterday", "2026-1-5", "2026-01-15T25:00:00Z"]) {
    assert.equal(timePointSchema.safeParse({ t, value: 1 }).success, false, t);
  }
  assert.equal(timePointSchema.safeParse({ t: "2026-01-15", value: Infinity }).success, false);
  assert.equal(timePointSchema.safeParse({ t: "2026-01-15", value: NaN }).success, false);
  assert.equal(timePointSchema.safeParse({ t: "2026-01-15", value: "1" }).success, false);
  assert.equal(timePointSchema.safeParse({ t: "2026-01-15", value: 1, extra: 1 }).success, false);
  assert.equal(timePointSchema.safeParse({ t: "2026-01-15", value: 1, annotations: [] }).success, false);
  assert.equal(
    timePointSchema.safeParse({
      t: "2026-01-15",
      value: 1,
      annotations: { big: "x".repeat(TS_LIMITS.pointAnnotationsBytesMax) },
    }).success,
    false,
  );
});

test("putPointsSchema: bounds the batch", () => {
  const p = { t: "2026-01-15", value: 1 };
  assert.equal(putPointsSchema.safeParse({ points: [] }).success, false);
  assert.equal(putPointsSchema.safeParse({ points: [p] }).success, true);
  assert.equal(putPointsSchema.safeParse({ points: Array(TS_LIMITS.batchMax).fill(p) }).success, true);
  assert.equal(putPointsSchema.safeParse({ points: Array(TS_LIMITS.batchMax + 1).fill(p) }).success, false);
  assert.equal(putPointsSchema.safeParse({ points: [p], extra: 1 }).success, false);
});

test("pointKey replaces '.' and keeps ':'", () => {
  assert.equal(pointKey("2026-01-15T10:00:00.123Z"), "2026-01-15T10:00:00_123Z");
  assert.equal(pointKey("2026-01-15"), "2026-01-15");
  assert.equal(pointKey("2026-01-15T10:00:00Z").includes(":"), true);
});

test("pointTimeMs orders a date against a datetime", () => {
  assert.equal(pointTimeMs("2026-01-15"), Date.parse("2026-01-15T00:00:00Z"));
  assert.ok(pointTimeMs("2026-01-15") < pointTimeMs("2026-01-15T00:00:01Z"));
  assert.ok(pointTimeMs("2026-01-15T23:00:00Z") < pointTimeMs("2026-01-16"));
});
