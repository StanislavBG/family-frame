import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerEventsRoutes } from "./apps/events";
import { EventsError, type EventsService } from "./events-service";

type Handler = (req: any, res: any, next?: any) => unknown;

function setup(overrides: Record<string, any> = {}, profile: any = { eventsSharing: { enabled: false } }) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "patch", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const service: any = {
    listRecommendations: async (...a: any[]) => (calls.push(["listRecommendations", ...a]), []),
    getRecommendation: async () => ({ eventId: "e1" }),
    getRunMeta: async () => null,
    getPreferences: async () => ({}),
    putPreferences: async (_u: string, b: any) => b,
    listFeedback: async () => [],
    deleteAllForHousehold: async () => undefined,
    respond: async () => ({ eventId: "e1" }),
    appendFeedback: async () => "liked",
    updatePlan: async () => ({ eventId: "e1" }),
    markSeen: async () => undefined,
    ...overrides,
  };
  registerEventsRoutes(app as Express, service as EventsService, { getProfile: async () => profile } as any);
  return { routes, calls };
}

async function call(routes: Map<string, Handler>, key: string, req: any = {}) {
  const out: any = { status: 200, body: undefined, ended: false };
  const res: any = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { out.ended = true; return res; },
  };
  const h = routes.get(key)!;
  await new Promise<void>((resolve) => {
    const origJson = res.json, origEnd = res.end;
    res.json = (b: unknown) => { origJson(b); resolve(); return res; };
    res.end = () => { origEnd(); resolve(); return res; };
    h({ headers: { "x-clerk-user-id": "u1" }, query: {}, params: { eventId: "e1" }, body: {}, method: "X", path: "/", ...req }, res, () => {});
  });
  return out;
}

test("registers the eleven routes in order", () => {
  assert.deepEqual([...setup().routes.keys()], [
    "GET /api/events/status",
    "GET /api/events/preferences",
    "PUT /api/events/preferences",
    "GET /api/events/feedback",
    "DELETE /api/events/data",
    "GET /api/events/items",
    "GET /api/events/items/:eventId",
    "POST /api/events/items/:eventId/response",
    "POST /api/events/items/:eventId/feedback",
    "PATCH /api/events/items/:eventId/plan",
    "POST /api/events/items/:eventId/seen",
  ]);
});

test("401 without x-clerk-user-id on every route", async () => {
  const { routes } = setup();
  for (const key of routes.keys()) {
    const out = await call(routes, key, { headers: {} });
    assert.equal(out.status, 401, key);
    assert.deepEqual(out.body, { error: "Unauthorized" });
  }
});

test("EventsError maps to its status (404 passthrough)", async () => {
  const { routes } = setup({
    getRecommendation: async () => { throw new EventsError("Event not found", 404); },
  });
  const out = await call(routes, "GET /api/events/items/:eventId");
  assert.equal(out.status, 404);
  assert.deepEqual(out.body, { error: "Event not found" });
});

test("bad response body returns 400", async () => {
  const { routes } = setup({
    respond: async () => { throw new EventsError("Invalid response: bad", 400); },
  });
  const out = await call(routes, "POST /api/events/items/:eventId/response", { body: { response: "nope" } });
  assert.equal(out.status, 400);
  assert.deepEqual(out.body, { error: "Invalid response: bad" });
});

test("items parses from, to and include=all", async () => {
  const { routes, calls } = setup();
  await call(routes, "GET /api/events/items", { query: { from: "2026-10-01", to: "2026-11-01", include: "all" } });
  assert.deepEqual(calls[0], ["listRecommendations", "u1", { from: "2026-10-01", to: "2026-11-01", includeHidden: true }]);
  await call(routes, "GET /api/events/items");
  assert.deepEqual(calls[1], ["listRecommendations", "u1", { from: undefined, to: undefined, includeHidden: false }]);
  const bad = await call(routes, "GET /api/events/items", { query: { from: "tomorrow" } });
  assert.equal(bad.status, 400);
});

test("status shape", async () => {
  const items = [
    { response: "new", hasUnseenUpdate: false },
    { response: "new", hasUnseenUpdate: true },
    { response: "going", hasUnseenUpdate: true },
    { response: "interested", hasUnseenUpdate: false },
  ];
  const { routes } = setup(
    { listRecommendations: async () => items, getRunMeta: async () => ({ lastPublishedAt: "2026-10-10T00:00:00.000Z" }) },
    { eventsSharing: { enabled: true }, address: { line1: "1 Main", city: "Portland", country: "US" } },
  );
  const out = await call(routes, "GET /api/events/status");
  assert.deepEqual(out.body, {
    sharingEnabled: true,
    addressComplete: true,
    lastPublishedAt: "2026-10-10T00:00:00.000Z",
    counts: { new: 2, going: 1, interested: 1, changed: 2 },
  });
  const empty = await call(setup().routes, "GET /api/events/status");
  assert.deepEqual(empty.body, {
    sharingEnabled: false,
    addressComplete: false,
    lastPublishedAt: null,
    counts: { new: 0, going: 0, interested: 0, changed: 0 },
  });
});
