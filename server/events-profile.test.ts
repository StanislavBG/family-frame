import { test } from "node:test";
import assert from "node:assert/strict";
import { householdProfile, PROFILE_GUIDANCE, LIFE_STAGES } from "../shared/events-profile";

test("two adults and a toddler", () => {
  const p = householdProfile([34, 32, 2]);
  assert.deepEqual(p.stages, ["toddler"]);
  assert.equal(p.lines[0], "Household: 2 adults and a toddler (1-2).");
});

test("adults only", () => {
  const p = householdProfile([40, 38]);
  assert.deepEqual(p.stages, ["adults-only"]);
  assert.ok(p.lines.length <= 3);
});

test("grandparent with a preschooler is multi-generational", () => {
  const p = householdProfile([70, 36, 4]);
  assert.deepEqual(p.stages, ["preschool", "multi-generational"]);
  assert.ok(!p.lines.join(" ").includes("70"));
});

test("three adults spanning 30+ years is multi-generational", () => {
  assert.ok(householdProfile([68, 40, 35]).stages.includes("multi-generational"));
  assert.ok(!householdProfile([45, 40, 35]).stages.includes("multi-generational"));
});

test("empty ages are unknown", () => {
  assert.deepEqual(householdProfile([]), { stages: [], lines: ["Household make-up unknown."] });
});

test("teen and school-age", () => {
  const p = householdProfile([15, 9, 45]);
  assert.deepEqual(p.stages, ["school-age", "teen"]);
  assert.ok(p.stages.every((s) => (LIFE_STAGES as readonly string[]).includes(s)));
});

test("guidance is non-empty", () => {
  assert.ok(PROFILE_GUIDANCE.length > 0);
});
