import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTodayIndex } from "./weather";

const dates = ["2026-10-08", "2026-10-09", "2026-10-10"];

test("uses location-local current date, late evening", () => {
  assert.equal(pickTodayIndex(dates, "2026-10-09T23:30"), 1);
});

test("uses location-local current date, early morning", () => {
  assert.equal(pickTodayIndex(dates, "2026-10-08T01:00"), 0);
});

test("falls back to server date when current time is missing", () => {
  const today = new Date().toISOString().split("T")[0];
  const list = ["2000-01-01", today, "2999-01-01"];
  assert.equal(pickTodayIndex(list, undefined), 1);
});

test("returns 0 when no date matches", () => {
  assert.equal(pickTodayIndex(["2000-01-01"], "2026-10-09T10:00"), 0);
});
