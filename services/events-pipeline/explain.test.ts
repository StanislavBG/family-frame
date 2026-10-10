import { test } from "node:test";
import assert from "node:assert/strict";
import { ffEventSchema } from "../../shared/events";
import type { FfEvent } from "../../shared/events";
import type { HaikuResult, HaikuRunInput, HaikuRunner } from "./haiku";
import { explainBatch, templateExplain } from "./explain";
import type { ExplainDigest, ExplainPick } from "./explain";

function makeEvent(id: string, over: Record<string, unknown> = {}): FfEvent {
  return ffEventSchema.parse({
    schemaVersion: 1,
    id,
    fingerprint: `fp-${id}`,
    title: `Event ${id}`,
    summary: "A summary",
    description: "A description",
    category: "parks-outdoors",
    schedule: { timezone: "America/Los_Angeles", start: "2026-10-17T10:00:00-07:00", allDay: false },
    location: { venueName: "Laurelhurst Park", address: "1 Secret St", city: "Portland", country: "United States", setting: "outdoor", online: false },
    cost: { isFree: true, ticketRequired: false, registrationRequired: false },
    audience: { ageBands: ["all-ages"], familyFriendly: true },
    sources: [{ url: "https://example.com/e", kind: "official", retrievedAt: "2026-10-10T00:00:00Z" }],
    status: "scheduled",
    verification: { lastCheckedAt: "2026-10-10T00:00:00Z", checkCount: 1, confidence: 0.9 },
    firstSeenAt: "2026-10-10T00:00:00Z",
    ...over,
  });
}

const pick = (id: string, over: Partial<ExplainPick> = {}): ExplainPick => ({
  event: makeEvent(id),
  matchReasons: ["Matches liked category parks-outdoors"],
  distanceKm: 3.2,
  ...over,
});

const family: ExplainDigest = { city: "Portland", memberAges: [38, 36, 5], likedCategories: ["parks-outdoors"], preferenceLines: ["Prefers free events"] };
const adults: ExplainDigest = { ...family, memberAges: [38, 36] };

function fake(result: HaikuResult | (() => HaikuResult)) {
  const calls: HaikuRunInput[] = [];
  const runner: HaikuRunner = {
    async run(input) {
      calls.push(input);
      return typeof result === "function" ? result() : result;
    },
  };
  return { runner, calls };
}

const item = (eventId: string, over: Record<string, unknown> = {}) => ({
  eventId,
  whyForHousehold: `Why ${eventId}`,
  whyForChildren: `Kids ${eventId}`,
  highlights: ["h1"],
  tips: ["t1"],
  ...over,
});

test("happy path: one run call, model text used", async () => {
  const { runner, calls } = fake({ ok: true, data: { items: [item("a"), item("b")] } });
  const out = await explainBatch(runner, family, [pick("a"), pick("b")]);
  assert.equal(calls.length, 1);
  assert.equal(out.size, 2);
  assert.deepEqual(out.get("a"), { whyForHousehold: "Why a", whyForChildren: "Kids a", highlights: ["h1"], tips: ["t1"] });
  const schema = JSON.stringify(calls[0].jsonSchema);
  assert.match(schema, /whyForHousehold/);
});

test("prompt has no street address, stays factual, includes digest", async () => {
  const { runner, calls } = fake({ ok: true, data: { items: [] } });
  await explainBatch(runner, family, [pick("a")]);
  const p = calls[0].prompt;
  assert.doesNotMatch(p, /1 Secret St/);
  assert.match(p, /Portland/);
  assert.match(p, /factual/i);
  assert.match(p, /Prefers free events/);
});

test("partial output falls back per event; unknown ids ignored", async () => {
  const { runner } = fake({ ok: true, data: { items: [item("a"), item("zzz")] } });
  const out = await explainBatch(runner, family, [pick("a"), pick("b")]);
  assert.deepEqual(Array.from(out.keys()).sort(), ["a", "b"]);
  assert.equal(out.get("a")!.whyForHousehold, "Why a");
  assert.deepEqual(out.get("b"), templateExplain(pick("b"), family));
});

test("failure falls back for all", async () => {
  const { runner, calls } = fake({ ok: false, reason: "timeout", detail: "x" });
  const picks = [pick("a"), pick("b")];
  const out = await explainBatch(runner, family, picks);
  assert.equal(calls.length, 1);
  assert.deepEqual(out.get("a"), templateExplain(picks[0], family));
  assert.deepEqual(out.get("b"), templateExplain(picks[1], family));
});

test("runner throwing and garbage data fall back", async () => {
  const thrower: HaikuRunner = { run: async () => { throw new Error("boom"); } };
  assert.equal((await explainBatch(thrower, family, [pick("a")])).size, 1);
  const { runner } = fake({ ok: true, data: { nope: 1 } });
  assert.deepEqual((await explainBatch(runner, family, [pick("a")])).get("a"), templateExplain(pick("a"), family));
});

test("limits are trimmed", async () => {
  const long = "x".repeat(1500);
  const { runner } = fake({
    ok: true,
    data: { items: [item("a", { whyForHousehold: long, whyForChildren: long, highlights: Array(9).fill(long), tips: ["  ", "ok", ...Array(8).fill("t")] })] },
  });
  const r = (await explainBatch(runner, family, [pick("a")])).get("a")!;
  assert.ok(r.whyForHousehold.length <= 1000);
  assert.ok(r.whyForChildren!.length <= 1000);
  assert.equal(r.highlights.length, 5);
  assert.ok(r.highlights.every((h) => h.length <= 200));
  assert.equal(r.tips.length, 5);
  assert.equal(r.tips[0], "ok");
});

test("no whyForChildren for an adults-only household", async () => {
  const { runner } = fake({ ok: true, data: { items: [item("a")] } });
  const out = await explainBatch(runner, adults, [pick("a"), pick("b")]);
  assert.equal(out.get("a")!.whyForChildren, undefined);
  assert.equal(out.get("b")!.whyForChildren, undefined);
  assert.ok(templateExplain(pick("b"), family).whyForChildren);
});

test("template mentions reasons, category and cost; empty picks skip the run", async () => {
  const t = templateExplain(pick("a"), family);
  assert.match(t.whyForHousehold, /Matches liked category/);
  assert.match(t.whyForHousehold, /free/i);
  const { runner, calls } = fake({ ok: true, data: { items: [] } });
  assert.equal((await explainBatch(runner, family, [])).size, 0);
  assert.equal(calls.length, 0);
});
