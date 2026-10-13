import { test } from "node:test";
import assert from "node:assert/strict";
import { getFieldPath } from "@shared/person-views";

test("getFieldPath walks nested objects", () => {
  assert.equal(getFieldPath({ a: { b: { c: 5 } } }, "a.b.c"), 5);
  assert.equal(getFieldPath({ a: 1 }, "a"), 1);
});

test("getFieldPath returns undefined for misses and bad intermediates", () => {
  assert.equal(getFieldPath({ a: 1 }, "b"), undefined);
  assert.equal(getFieldPath({ a: null }, "a.b"), undefined);
  assert.equal(getFieldPath({ a: [{ b: 1 }] }, "a.b"), undefined);
  assert.equal(getFieldPath({ a: [1] }, "a.0"), undefined);
  assert.equal(getFieldPath({ a: 1 }, "a.b"), undefined);
  assert.equal(getFieldPath(null, "a"), undefined);
  assert.equal(getFieldPath({ a: 1 }, ""), undefined);
  assert.equal(getFieldPath({}, "constructor"), undefined);
});
