import { test } from "node:test";
import assert from "node:assert/strict";
import { createFfClient, FfClientError } from "./ff-client";

interface Call { url: string; init: RequestInit }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function fakeFetch(responses: Array<Response | Error | ((call: Call) => Response)>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next.clone();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const make = (f: typeof fetch) =>
  createFfClient({ baseUrl: "https://ff.example.com/", token: "tok-secret", fetch: f, retryDelayMs: 1 });

const prefs = { likedCategories: [], avoidedCategories: [], maxDistanceKm: 30, budget: "any", preferredDays: [] };
const upsert = (n: number) => ({
  created: n, updated: 0, unchanged: 0,
  ids: Array.from({ length: n }, (_, i) => `e${i}`), changed: [],
});

test("sends bearer token and JSON headers", async () => {
  const { impl, calls } = fakeFetch([json(200, { deleted: true })]);
  await make(impl).withdraw("h1", "ev 1");
  assert.equal(calls[0].url, "https://ff.example.com/api/service/events/households/h1/recommendations/ev%201");
  assert.equal(calls[0].init.method, "DELETE");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tok-secret");
  assert.equal(headers.Accept, "application/json");
});

test("sends JSON content type on bodies", async () => {
  const run = { runId: "r1", kind: "discover" as const, startedAt: "a", finishedAt: "b", stats: {} };
  const { impl, calls } = fakeFetch([json(200, { lastRunId: "r1", lastPublishedAt: "t", lastRun: run })]);
  await make(impl).recordRun("h1", run);
  assert.equal((calls[0].init.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), run);
});

test("https guard", () => {
  const f = fakeFetch([]).impl;
  assert.throws(() => createFfClient({ baseUrl: "http://ff.example.com", token: "t", fetch: f }), /https/);
  assert.throws(() => createFfClient({ baseUrl: "not a url", token: "t", fetch: f }));
  assert.doesNotThrow(() => createFfClient({ baseUrl: "http://localhost:5000", token: "t", fetch: f }));
  assert.doesNotThrow(() => createFfClient({ baseUrl: "http://127.0.0.1:5000", token: "t", fetch: f }));
});

test("retries once on 503 then succeeds", async () => {
  const { impl, calls } = fakeFetch([json(503, { error: "down" }), json(200, { deleted: false })]);
  assert.deepEqual(await make(impl).withdraw("h1", "e"), { deleted: false });
  assert.equal(calls.length, 2);
});

test("retries once on network error then throws FfClientError", async () => {
  const { impl, calls } = fakeFetch([new TypeError("fetch failed")]);
  await assert.rejects(make(impl).withdraw("h1", "e"), (e: unknown) => e instanceof FfClientError && e.status === 0);
  assert.equal(calls.length, 2);
});

test("persistent 5xx throws after one retry", async () => {
  const { impl, calls } = fakeFetch([json(500, { error: "boom" })]);
  await assert.rejects(make(impl).withdraw("h1", "e"), (e: unknown) => e instanceof FfClientError && e.status === 500 && e.message === "boom");
  assert.equal(calls.length, 2);
});

test("does not retry on 400", async () => {
  const { impl, calls } = fakeFetch([json(400, { error: "bad" })]);
  await assert.rejects(make(impl).withdraw("h1", "e"), (e: unknown) => e instanceof FfClientError && e.status === 400);
  assert.equal(calls.length, 1);
});

test("404 on per-household calls returns notSharing", async () => {
  const { impl, calls } = fakeFetch([json(404, { error: "Household not found" })]);
  const c = make(impl);
  assert.deepEqual(await c.getState("h1"), { notSharing: true });
  assert.deepEqual(await c.withdraw("h1", "e"), { notSharing: true });
  assert.deepEqual(await c.putRecommendations("h1", { runId: "r", recommendations: [{} as any] }), { notSharing: true });
  assert.equal(calls.length, 3);
});

test("getState passes feedbackSince and validates", async () => {
  const state = { householdId: "h1", recommendations: [], busy: [], feedback: [], preferences: prefs, learned: {} };
  const { impl, calls } = fakeFetch([json(200, state)]);
  const result = await make(impl).getState("h1", "2026-01-01T00:00:00Z");
  assert.equal((result as any).householdId, "h1");
  assert.match(calls[0].url, /\/state\?feedbackSince=2026-01-01T00%3A00%3A00Z$/);
});

test("splits 120 recommendations into sequential batches and sums", async () => {
  const sizes: number[] = [];
  const { impl, calls } = fakeFetch([
    (call) => {
      const n = JSON.parse(call.init.body as string).recommendations.length;
      sizes.push(n);
      return json(200, upsert(n));
    },
  ]);
  const recs = Array.from({ length: 120 }, (_, i) => ({ i }) as any);
  const result = await make(impl).putRecommendations("h1", { runId: "r1", recommendations: recs });
  assert.deepEqual(sizes, [50, 50, 20]);
  assert.equal(calls.length, 3);
  assert.equal((result as any).created, 120);
  assert.equal((result as any).ids.length, 120);
});

test("response validation failure throws and never returns bad data", async () => {
  const { impl } = fakeFetch([json(200, { households: [{ householdId: "h1" }] })]);
  await assert.rejects(make(impl).listHouseholds(), (e: unknown) => e instanceof FfClientError && /validation/.test(e.message));
  const bad = fakeFetch([json(200, { created: "many" })]);
  await assert.rejects(make(bad.impl).putRecommendations("h1", { runId: "r", recommendations: [{} as any] }), FfClientError);
});
