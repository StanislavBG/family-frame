import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventsService, EventsError } from "./events-service";
import { EVENTS_LIMITS, SAMPLE_RECOMMENDATION_INPUT, type RecommendationInput } from "@shared/events";

// Map-backed fake: nested object tree addressed by slash paths, like RTDB (null deletes).
function makeDeps(nowIso = "2026-10-10T00:00:00.000Z") {
  const root: any = {};
  let pushSeq = 0;
  const walk = (path: string, create: boolean) => {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (const p of parts.slice(0, -1)) {
      if (node[p] === undefined) {
        if (!create) return [undefined, ""] as const;
        node[p] = {};
      }
      node = node[p];
    }
    return [node, parts[parts.length - 1]] as const;
  };
  const deps = {
    async get(path: string) {
      const [n, k] = walk(path, false);
      return n && n[k] !== undefined ? structuredClone(n[k]) : null;
    },
    async set(path: string, value: any) {
      const [n, k] = walk(path, true);
      if (value === null) delete n[k];
      else n[k] = structuredClone(value);
    },
    async update(path: string, values: Record<string, any>) {
      for (const [k, v] of Object.entries(values)) await deps.set(`${path}/${k}`, v);
    },
    async remove(path: string) {
      const [n, k] = walk(path, false);
      if (n) delete n[k];
    },
    async push(path: string, value: any) {
      await deps.set(`${path}/-k${++pushSeq}`, value);
    },
    now: () => new Date(nowIso),
  };
  return { deps, root };
}

const clone = <T>(x: T): T => structuredClone(x);

function withEvent(id: string, patch: (e: RecommendationInput["event"]) => void): RecommendationInput {
  const r = clone(SAMPLE_RECOMMENDATION_INPUT);
  r.event.id = id;
  patch(r.event);
  return r;
}

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: any) => e instanceof EventsError && e.status === status);
}

test("upsert creates records with defaults and JSON-string storage", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const res = await svc.upsertRecommendations("u1", { runId: "r1", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  assert.deepEqual(res, { created: 1, updated: 0, unchanged: 0, ids: ["pumpkin-festival-2026"], changed: [] });
  const stored = root.eventRecs.u1["pumpkin-festival-2026"];
  assert.equal(typeof stored.eventJson, "string");
  assert.equal(typeof stored.recJson, "string");
  assert.equal(stored.response, "new");
  assert.equal(stored.hasUnseenUpdate, false);
  assert.equal(stored.withdrawn, false);
  assert.equal(stored.lastRunId, "r1");
  assert.equal(JSON.stringify(stored).includes("undefined"), false);
});

test("upsert validates input (400) and oversized event JSON (400)", async () => {
  const svc = createEventsService(makeDeps().deps);
  await rejects(svc.upsertRecommendations("u1", { runId: "r", recommendations: [] }), 400);
  await rejects(svc.upsertRecommendations("u1", { nope: 1 }), 400);
  const big = withEvent("big", (e) => {
    e.description = "x".repeat(5000);
    e.tags = [];
    e.sources = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${"p".repeat(1900)}${i}`,
      title: "t".repeat(300),
      publisher: "p".repeat(200),
      kind: "other" as const,
      retrievedAt: "2026-10-09T08:00:00-07:00",
    }));
  });
  assert.ok(JSON.stringify(big.event).length > EVENTS_LIMITS.maxEventJsonBytes);
  await rejects(svc.upsertRecommendations("u1", { runId: "r", recommendations: [big] }), 400);
});

test("upsert preserves household-owned fields and reports unchanged/updated", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const id = "pumpkin-festival-2026";
  await svc.upsertRecommendations("u1", { runId: "r1", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  Object.assign(root.eventRecs.u1[id], {
    response: "going",
    respondedAt: "2026-10-10T01:00:00Z",
    feedback: { relevance: "relevant" },
    calendar: { calendarEventId: "c1", visibility: "Shared" },
    plan: { notes: "bring boots" },
    seenAt: "2026-10-10T02:00:00Z",
  });
  const same = await svc.upsertRecommendations("u1", { runId: "r2", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  assert.deepEqual([same.created, same.updated, same.unchanged, same.changed], [0, 0, 1, []]);
  const edited = clone(SAMPLE_RECOMMENDATION_INPUT);
  edited.event.title = "Renamed Festival";
  edited.matchScore = 0.5;
  const res = await svc.upsertRecommendations("u1", { runId: "r3", recommendations: [edited] });
  assert.deepEqual([res.created, res.updated, res.unchanged, res.changed], [0, 1, 0, []]);
  const s = root.eventRecs.u1[id];
  assert.equal(JSON.parse(s.eventJson).title, "Renamed Festival");
  assert.equal(s.response, "going");
  assert.equal(s.respondedAt, "2026-10-10T01:00:00Z");
  assert.deepEqual(s.feedback, { relevance: "relevant" });
  assert.deepEqual(s.calendar, { calendarEventId: "c1", visibility: "Shared" });
  assert.deepEqual(s.plan, { notes: "bring boots" });
  assert.equal(s.seenAt, "2026-10-10T02:00:00Z");
  assert.equal(s.lastRunId, "r3");
  assert.equal(s.hasUnseenUpdate, false);
});

test("upsert flags hasUnseenUpdate on later update entry or status change", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const id = "pumpkin-festival-2026";
  await svc.upsertRecommendations("u1", { runId: "r1", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });

  const priced = withEvent(id, (e) => {
    e.updates.push({ at: "2026-10-10T08:00:00-07:00", kind: "price-changed", summary: "Cheaper" });
  });
  const r1 = await svc.upsertRecommendations("u1", { runId: "r2", recommendations: [priced] });
  assert.deepEqual(r1.changed, [id]);
  assert.equal(root.eventRecs.u1[id].hasUnseenUpdate, true);

  await svc.markSeen("u1", id);
  assert.equal(root.eventRecs.u1[id].hasUnseenUpdate, false);
  assert.ok(root.eventRecs.u1[id].seenAt);

  const cancelled = withEvent(id, (e) => {
    e.updates.push({ at: "2026-10-10T08:00:00-07:00", kind: "price-changed", summary: "Cheaper" });
    e.status = "cancelled";
  });
  const r2 = await svc.upsertRecommendations("u1", { runId: "r3", recommendations: [cancelled] });
  assert.deepEqual(r2.changed, [id]);
  assert.equal(root.eventRecs.u1[id].hasUnseenUpdate, true);

  // Only a description tweak: updated but not flagged.
  await svc.markSeen("u1", id);
  const tweak = withEvent(id, (e) => {
    e.updates.push({ at: "2026-10-10T08:00:00-07:00", kind: "price-changed", summary: "Cheaper" });
    e.status = "cancelled";
    e.summary = "Different summary.";
  });
  const r3 = await svc.upsertRecommendations("u1", { runId: "r4", recommendations: [tweak] });
  assert.deepEqual([r3.updated, r3.changed], [1, []]);
  assert.equal(root.eventRecs.u1[id].hasUnseenUpdate, false);
});

test("upsert prunes old ended new/dismissed records but keeps others", async () => {
  const { deps, root } = makeDeps("2026-12-01T00:00:00.000Z");
  const svc = createEventsService(deps);
  const old = (id: string) =>
    withEvent(id, (e) => {
      e.schedule = { timezone: "UTC", start: "2026-09-01T10:00:00Z", end: "2026-09-01T12:00:00Z", allDay: false, occurrences: [] };
    });
  await svc.upsertRecommendations("u1", { runId: "r0", recommendations: [old("old-new"), old("old-dismissed"), old("old-going")] });
  root.eventRecs.u1["old-dismissed"].response = "dismissed";
  root.eventRecs.u1["old-going"].response = "going";
  const fresh = withEvent("fresh", (e) => {
    e.schedule = { timezone: "UTC", start: "2026-12-20T10:00:00Z", allDay: false, occurrences: [] };
  });
  await svc.upsertRecommendations("u1", { runId: "r1", recommendations: [fresh] });
  assert.deepEqual(Object.keys(root.eventRecs.u1).sort(), ["fresh", "old-going"]);
});

test("upsert refuses batch over maxActivePerHousehold with 409", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  root.eventRecs = { u1: {} };
  for (let i = 0; i < EVENTS_LIMITS.maxActivePerHousehold; i++) {
    root.eventRecs.u1[`e${i}`] = { eventJson: "{}", recJson: "{}", response: "going", hasUnseenUpdate: false, withdrawn: false };
  }
  await rejects(svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] }), 409);
  assert.equal(Object.keys(root.eventRecs.u1).length, EVENTS_LIMITS.maxActivePerHousehold);
});

test("list sorts by start, hides hidden by default, filters range, skips corrupt", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const at = (id: string, start: string) =>
    withEvent(id, (e) => {
      e.schedule = { timezone: "UTC", start, end: start, allDay: false, occurrences: [] };
    });
  await svc.upsertRecommendations("u1", {
    runId: "r",
    recommendations: [at("c", "2026-11-03T10:00:00Z"), at("a", "2026-10-20T10:00:00Z"), at("b", "2026-10-25T10:00:00Z"), at("d", "2026-11-09T10:00:00Z")],
  });
  root.eventRecs.u1.b.response = "not-interested";
  root.eventRecs.u1.d.withdrawn = true;
  root.eventRecs.u1.bad = { eventJson: "{not json", recJson: "{}", response: "new" };

  const visible = await svc.listRecommendations("u1");
  assert.deepEqual(visible.map((i) => i.eventId), ["a", "c"]);
  assert.equal(visible[0].event.id, "a");
  assert.equal(visible[0].rec.matchScore, 0.87);
  const all = await svc.listRecommendations("u1", { includeHidden: true });
  assert.deepEqual(all.map((i) => i.eventId), ["a", "b", "c", "d"]);
  const ranged = await svc.listRecommendations("u1", { from: "2026-10-30T00:00:00Z", to: "2026-11-05T00:00:00Z" });
  assert.deepEqual(ranged.map((i) => i.eventId), ["c"]);
});

test("getRecommendation returns one or 404", async () => {
  const svc = createEventsService(makeDeps().deps);
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  const item = await svc.getRecommendation("u1", "pumpkin-festival-2026");
  assert.equal(item.response, "new");
  assert.equal(item.event.title, SAMPLE_RECOMMENDATION_INPUT.event.title);
  await rejects(svc.getRecommendation("u1", "missing"), 404);
});

test("withdraw deletes new/hidden records, flags engaged ones", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  await svc.upsertRecommendations("u1", {
    runId: "r",
    recommendations: [withEvent("n", () => {}), withEvent("g", () => {}), withEvent("x", () => {})],
  });
  root.eventRecs.u1.g.response = "going";
  root.eventRecs.u1.x.response = "not-interested";
  await svc.withdraw("u1", "n");
  await svc.withdraw("u1", "g");
  await svc.withdraw("u1", "x");
  assert.equal(root.eventRecs.u1.n, undefined);
  assert.equal(root.eventRecs.u1.x, undefined);
  assert.equal(root.eventRecs.u1.g.withdrawn, true);
  assert.equal(root.eventRecs.u1.g.response, "going");
  await rejects(svc.withdraw("u1", "n"), 404);
  await rejects(svc.markSeen("u1", "n"), 404);
});

test("recordRun stores eventRunMeta/<userId>", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const meta = await svc.recordRun("u1", { runId: "run-9", found: 12, published: 5 });
  assert.equal(meta.lastRunId, "run-9");
  assert.deepEqual(root.eventRunMeta.u1, {
    lastRunId: "run-9",
    lastPublishedAt: "2026-10-10T00:00:00.000Z",
    lastRun: { runId: "run-9", found: 12, published: 5 },
  });
  await rejects(svc.recordRun("u1", {} as any), 400);
});

test("appendFeedback pushes snapshot entry and sets the matching axis", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const id = "pumpkin-festival-2026";
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [{ ...SAMPLE_RECOMMENDATION_INPUT, distanceKm: 4.2 } as any] });
  await svc.appendFeedback("u1", id, { signal: "relevant" });
  await svc.appendFeedback("u1", id, { signal: "disliked", reason: "too crowded" });
  await svc.appendFeedback("u1", id, { signal: "more-like-this" });
  await svc.appendFeedback("u1", id, { signal: "not-relevant" });
  assert.deepEqual(root.eventRecs.u1[id].feedback, { relevance: "not-relevant", sentiment: "disliked", steer: "more-like-this" });
  const entries = Object.values<any>(root.eventFeedback.u1);
  assert.equal(entries.length, 4);
  const e = entries[1];
  assert.equal(e.signal, "disliked");
  assert.equal(e.reason, "too crowded");
  assert.equal(e.eventId, id);
  assert.ok(e.id);
  assert.equal(e.at, "2026-10-10T00:00:00.000Z");
  assert.deepEqual(e.snapshot, {
    title: "Riverside Family Pumpkin Festival",
    category: "holiday-seasonal",
    tags: ["pumpkins", "hayride", "costume-parade", "harvest"],
    isFree: false,
    distanceKm: 4.2,
    weekday: 6,
    ageBands: ["baby", "toddler", "preschool", "school-age", "adult"],
  });
  await rejects(svc.appendFeedback("u1", "missing", { signal: "liked" }), 404);
  await rejects(svc.appendFeedback("u1", id, { signal: "bogus" }), 400);
});

test("feedback survives event pruning", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  await svc.appendFeedback("u1", "pumpkin-festival-2026", { signal: "liked" });
  await svc.withdraw("u1", "pumpkin-festival-2026");
  assert.equal(root.eventRecs.u1["pumpkin-festival-2026"], undefined);
  assert.equal((await svc.listFeedback("u1")).length, 1);
});

test("appendResponseFeedback pushes a response:<response> entry", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  await svc.appendResponseFeedback("u1", "pumpkin-festival-2026", "going");
  const [entry] = Object.values<any>(root.eventFeedback.u1);
  assert.equal(entry.signal, "response:going");
  assert.equal(entry.snapshot.title, "Riverside Family Pumpkin Festival");
  assert.equal(root.eventRecs.u1["pumpkin-festival-2026"].feedback, undefined);
  await rejects(svc.appendResponseFeedback("u1", "missing", "going"), 404);
});

test("listFeedback is newest first, filters by since, clamps limit", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  const snap = { title: "t", category: "holiday-seasonal", tags: [], isFree: true, weekday: 1, ageBands: [] };
  root.eventFeedback = {
    u1: {
      a: { id: "a", at: "2026-10-01T00:00:00Z", eventId: "x", signal: "liked", snapshot: snap },
      b: { id: "b", at: "2026-10-03T00:00:00Z", eventId: "x", signal: "liked", snapshot: snap },
      c: { id: "c", at: "2026-10-02T00:00:00Z", eventId: "x", signal: "liked", snapshot: snap },
    },
  };
  assert.deepEqual((await svc.listFeedback("u1")).map((e) => e.id), ["b", "c", "a"]);
  assert.deepEqual((await svc.listFeedback("u1", { since: "2026-10-01T00:00:00Z" })).map((e) => e.id), ["b", "c"]);
  assert.deepEqual((await svc.listFeedback("u1", { limit: 1 })).map((e) => e.id), ["b"]);
  assert.deepEqual(await svc.listFeedback("nobody"), []);
});

test("preferences default, validate and store", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  const defaults = await svc.getPreferences("u1");
  assert.equal(defaults.maxDistanceKm, 30);
  assert.equal(defaults.budget, "any");
  await rejects(svc.putPreferences("u1", { maxDistanceKm: 9999 }), 400);
  await rejects(svc.putPreferences("u1", { nope: 1 }), 400);
  const saved = await svc.putPreferences("u1", { budget: "free", maxDistanceKm: 10 });
  assert.equal(root.eventPrefs.u1.budget, "free");
  assert.deepEqual(await svc.getPreferences("u1"), saved);
});

test("deleteAllForHousehold removes events data but not calendar", async () => {
  const { deps, root } = makeDeps();
  const svc = createEventsService(deps);
  await svc.upsertRecommendations("u1", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  await svc.upsertRecommendations("u2", { runId: "r", recommendations: [SAMPLE_RECOMMENDATION_INPUT] });
  await svc.appendFeedback("u1", "pumpkin-festival-2026", { signal: "liked" });
  await svc.putPreferences("u1", { budget: "low" });
  await svc.recordRun("u1", { runId: "r" });
  root.calendar = { u1: { c1: { title: "keep" } } };
  await svc.deleteAllForHousehold("u1");
  for (const k of ["eventRecs", "eventFeedback", "eventPrefs", "eventRunMeta"]) assert.equal(root[k]?.u1, undefined, k);
  assert.ok(root.eventRecs.u2);
  assert.ok(root.calendar.u1.c1);
});
