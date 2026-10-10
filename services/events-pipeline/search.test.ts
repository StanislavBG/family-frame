import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_CATEGORIES, eventPreferencesSchema } from "../../shared/events";
import type { EventCategory } from "../../shared/events";
import type { PreferenceSummary } from "../../shared/events-preferences";
import type { HaikuRunner } from "./haiku";
import { RAW_CANDIDATES_JSON_SCHEMA } from "./normalize";
import { ageBandsFromAges, buildSearchPrompt, planSearchTasks, runSearchTask } from "./search";
import type { PlanInput, SearchTask } from "./search";

const now = new Date("2026-10-10T12:00:00Z");
const area = { city: "Portland", region: "Oregon", country: "United States" };

function learned(over: Partial<Record<EventCategory, number>> = {}): PreferenceSummary {
  const categoryWeights = {} as Record<EventCategory, number>;
  for (const c of EVENT_CATEGORIES) categoryWeights[c] = over[c] ?? 0;
  return { categoryWeights, tagWeights: {}, freePreference: 0, maxDistanceKm: 30, preferredWeekdays: [], signalsCount: 0, lines: [] };
}
const household = (
  prefs: Record<string, unknown> = {},
  l: Partial<Record<EventCategory, number>> = {},
  memberAges: number[] = [],
) => ({ preferences: eventPreferencesSchema.parse(prefs), learned: learned(l), memberAges });

const plan = (over: Partial<PlanInput> = {}) =>
  planSearchTasks({
    areaKey: "us-or-portland",
    area,
    radiusKm: 30,
    households: [household()],
    lastSearchAt: () => null,
    now,
    ...over,
  });

test("never searched: focus general first, within maxTasks", () => {
  const tasks = plan();
  assert.equal(tasks[0].windowKey, "focus");
  assert.equal(tasks[0].categoryKey, "general");
  assert.equal(tasks[0].fromDate, "2026-10-10");
  assert.equal(tasks[0].toDate, "2026-10-24");
  assert.ok(tasks.length <= 6);
  assert.equal(plan({ maxTasks: 2 }).length, 2);
});

test("window due logic", () => {
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const recent = plan({ lastSearchAt: (w) => (w === "focus" ? ago(19) : w === "near" ? ago(24 * 2) : ago(24 * 6)) });
  assert.equal(recent.length, 0);
  const due = plan({ lastSearchAt: (w) => (w === "focus" ? ago(21) : w === "near" ? ago(24 * 4) : ago(24 * 8)) });
  assert.deepEqual(new Set(due.map((t) => t.windowKey)), new Set(["focus", "near", "far"]));
  const near = due.find((t) => t.windowKey === "near")!;
  assert.equal(near.fromDate, "2026-10-25");
  assert.equal(near.toDate, "2026-11-24");
  assert.equal(due.find((t) => t.windowKey === "far")!.toDate, "2027-01-08");
});

test("only stale pairs are returned", () => {
  const tasks = plan({ lastSearchAt: (w, k) => (w === "focus" && k === "general" ? now.toISOString() : null) });
  assert.ok(!tasks.some((t) => t.windowKey === "focus" && t.categoryKey === "general"));
  assert.ok(tasks.length > 0);
});

test("preferred categories are ordered first", () => {
  const tasks = plan({ households: [household({ likedCategories: ["faith-church"] }, { "arts-culture": 0.5 })] });
  const focusSpecific = tasks.find((t) => t.windowKey === "focus" && t.categoryKey !== "general")!;
  assert.equal(focusSpecific.categories[0], "faith-church");
  assert.equal(focusSpecific.categories[1], "arts-culture");
});

test("categories avoided by all households are excluded; partial avoidance kept", () => {
  const all = plan({
    households: [household({ avoidedCategories: ["faith-church", "kids-activities"] }), household({ avoidedCategories: ["faith-church"] })],
    maxTasks: 20,
  });
  const cats = all.flatMap((t) => t.categories);
  assert.ok(!cats.includes("faith-church"));
  assert.ok(cats.includes("kids-activities"));
  const both = plan({
    households: [household({ avoidedCategories: ["kids-activities"] }), household({ avoidedCategories: ["kids-activities"] })],
    maxTasks: 20,
  });
  assert.ok(!both.flatMap((t) => t.categories).includes("kids-activities"));
  assert.equal(both[0].categoryKey, "general");
});

test("age bands from ages", () => {
  assert.deepEqual(ageBandsFromAges([0, 2, 4, 9, 15, 40]), [
    "baby (under 1)",
    "toddler (1-2)",
    "preschool (3-5)",
    "school-age (6-12)",
    "teen (13-17)",
  ]);
  assert.deepEqual(ageBandsFromAges([35, 38]), []);
});

const task: SearchTask = {
  windowKey: "focus",
  fromDate: "2026-10-10",
  toDate: "2026-10-24",
  categoryKey: "general",
  categories: ["kids-activities", "festivals-fairs"],
};

test("prompt contents and no street address", () => {
  const withAddress = { ...area, radiusKm: 25, line1: "742 Evergreen Terrace" };
  const known = Array.from({ length: 80 }, (_, i) => ({ title: `Known ${i}`, date: "2026-10-12" }));
  const prompt = buildSearchPrompt(task, withAddress, known, "Family with a toddler (1-2) and school-age (6-12) kids");
  for (const s of ["Portland", "Oregon", "United States", "25 km", "2026-10-10", "2026-10-24", "kids-activities", "festivals-fairs", "toddler", "https://", "never invent"]) {
    assert.ok(prompt.toLowerCase().includes(s.toLowerCase()), s);
  }
  assert.ok(prompt.includes("- Known 59 (2026-10-12)"));
  assert.ok(!prompt.includes("Known 60"));
  assert.ok(!prompt.includes("742 Evergreen"));
  assert.ok(!prompt.includes("line1"));
});

test("runSearchTask validates candidates with a fake runner", async () => {
  const good = {
    title: "Pumpkin Fest",
    description: "Family fun",
    start: "2026-10-18T10:00:00",
    city: "Portland",
    country: "United States",
    category: "festivals-fairs",
    sourceUrls: ["https://example.org/pumpkin"],
  };
  let seen: { prompt: string; jsonSchema: unknown } | undefined;
  const runner: HaikuRunner = {
    async run(input) {
      seen = input;
      return { ok: true, data: { candidates: [good, { ...good, sourceUrls: ["http://insecure.example"] }, { nope: 1 }] } };
    },
  };
  const res = await runSearchTask(runner, task, { ...area, radiusKm: 30 }, [], "");
  assert.equal(seen?.jsonSchema, RAW_CANDIDATES_JSON_SCHEMA);
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.candidates.length, 1);
    assert.equal(res.invalid, 2);
  }

  const failing: HaikuRunner = { run: async () => ({ ok: false, reason: "timeout", detail: "slow" }) };
  const bad = await runSearchTask(failing, task, { ...area, radiusKm: 30 }, [], "");
  assert.deepEqual(bad, { ok: false, reason: "timeout", detail: "slow" });

  const noList: HaikuRunner = { run: async () => ({ ok: true, data: {} }) };
  const missing = await runSearchTask(noList, task, { ...area, radiusKm: 30 }, [], "");
  assert.equal(missing.ok, false);
});
