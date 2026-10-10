import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerEventsServiceRoutes, memberAgesFrom } from "./events-service-routes";

type Handler = (req: any, res: any, next?: any) => unknown;

const ADDRESS = { line1: "1 Main St", city: "Sofia", country: "Bulgaria", timezone: "Europe/Sofia" };
const NOW = new Date("2026-10-10T12:00:00Z");

function setup(sharing: any[] = [{ userId: "u1", address: ADDRESS, eventsSharing: { enabled: true, consentVersion: 1 } }]) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "patch", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const events: any = {
    upsertRecommendations: async (...a: any[]) => (calls.push(["upsert", ...a]), { created: 1, updated: 0, unchanged: 0, ids: ["e1"], changed: [] }),
    listRecommendations: async () => [],
    withdraw: async (...a: any[]) => (calls.push(["withdraw", ...a]), { deleted: true }),
    recordRun: async (...a: any[]) => (calls.push(["recordRun", ...a]), { lastRunId: "r1" }),
    listFeedback: async () => [],
    getPreferences: async () => ({}),
    getRunMeta: async () => null,
    listBusy: async () => [],
  };
  registerEventsServiceRoutes(app as Express, {
    events,
    profiles: { listSharingHouseholds: async () => sharing },
    getUserData: async () => ({
      username: "ann",
      settings: { homeName: "Home" },
      people: [{ name: "Kid", birthday: "2020-10-11" }, { name: "Mum", birthday: "1990-01-01" }, { name: "NoBday" }],
    }),
    now: () => NOW,
  } as any);
  return { routes, calls };
}

async function call(routes: Map<string, Handler>, key: string, req: any = {}) {
  const out: any = { status: 200, body: undefined };
  const res: any = {};
  await new Promise<void>((resolve) => {
    res.status = (c: number) => { out.status = c; return res; };
    res.json = (b: unknown) => { out.body = b; resolve(); return res; };
    res.end = () => { resolve(); return res; };
    routes.get(key)!({ headers: { "x-ff-auth": "service" }, query: {}, params: { householdId: "u1", eventId: "e1" }, body: {}, ...req }, res, () => {});
  });
  return out;
}

test("registers the five routes", () => {
  assert.deepEqual([...setup().routes.keys()], [
    "GET /api/service/events/households",
    "GET /api/service/events/households/:householdId/state",
    "PUT /api/service/events/households/:householdId/recommendations",
    "DELETE /api/service/events/households/:householdId/recommendations/:eventId",
    "POST /api/service/events/households/:householdId/runs",
  ]);
});

test("403 without service auth (session and pat)", async () => {
  const { routes } = setup();
  for (const key of routes.keys()) {
    for (const kind of ["session", "pat", undefined]) {
      const out = await call(routes, key, { headers: kind ? { "x-ff-auth": kind, "x-clerk-user-id": "u1" } : {} });
      assert.equal(out.status, 403, `${key} ${kind}`);
    }
  }
});

test("opted-out household is 404 on all four per-household routes", async () => {
  const { routes, calls } = setup([]);
  const runBody = { runId: "r1", kind: "discover", startedAt: "a", finishedAt: "b", stats: {} };
  for (const key of [...routes.keys()].filter((k) => k.includes(":householdId"))) {
    const out = await call(routes, key, { body: runBody });
    assert.equal(out.status, 404, key);
  }
  assert.deepEqual(calls, []);
});

test("list shape has ages but no birthdays or names", async () => {
  const { routes } = setup();
  const out = await call(routes, "GET /api/service/events/households");
  assert.equal(out.status, 200);
  const h = out.body.households[0];
  assert.equal(h.householdId, "u1");
  assert.equal(h.homeName, "Home");
  assert.equal(h.timezone, "Europe/Sofia");
  assert.deepEqual(h.memberAges, [5, 36]);
  assert.equal(h.consentVersion, 1);
  assert.equal(h.lastPublishedAt, null);
  const json = JSON.stringify(out.body);
  assert.ok(!json.includes("birthday") && !json.includes("2020-10") && !json.includes("Kid") && !json.includes("Mum"));
});

test("memberAgesFrom computes whole years and skips invalid birthdays", () => {
  assert.deepEqual(memberAgesFrom([{ birthday: "2020-10-10" }, { birthday: "2020-10-11" }, { birthday: "bad" }, {}], "2026-10-10"), [6, 5]);
  assert.deepEqual(memberAgesFrom(undefined, "2026-10-10"), []);
});

test("state returns the documented shape", async () => {
  const { routes } = setup();
  const out = await call(routes, "GET /api/service/events/households/:householdId/state", { query: { feedbackSince: "2026-01-01T00:00:00Z" } });
  assert.equal(out.status, 200);
  assert.deepEqual(Object.keys(out.body).sort(), ["busy", "feedback", "householdId", "learned", "preferences", "recommendations"]);
});

test("PUT passes body through, DELETE withdraws", async () => {
  const { routes, calls } = setup();
  const body = { runId: "r1", recommendations: [] };
  const put = await call(routes, "PUT /api/service/events/households/:householdId/recommendations", { body });
  assert.equal(put.body.created, 1);
  assert.deepEqual(calls[0], ["upsert", "u1", body]);
  const del = await call(routes, "DELETE /api/service/events/households/:householdId/recommendations/:eventId");
  assert.deepEqual(del.body, { deleted: true });
  assert.deepEqual(calls[1], ["withdraw", "u1", "e1"]);
});

test("runs validates body", async () => {
  const { routes, calls } = setup();
  const key = "POST /api/service/events/households/:householdId/runs";
  const bad = await call(routes, key, { body: { runId: "r1", kind: "other", startedAt: "a", finishedAt: "b", stats: {} } });
  assert.equal(bad.status, 400);
  const bad2 = await call(routes, key, { body: { runId: "r1", kind: "refresh", startedAt: "a", finishedAt: "b", stats: { x: "1" } } });
  assert.equal(bad2.status, 400);
  assert.equal(calls.length, 0);
  const good = { runId: "r1", kind: "refresh", startedAt: "a", finishedAt: "b", stats: { found: 3 } };
  const ok = await call(routes, key, { body: good });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0], ["recordRun", "u1", good]);
});
