import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { createEventsService } from "./events-service";
import { registerEventsServiceRoutes } from "./events-service-routes";

type Handler = (req: any, res: any, next?: any) => unknown;

const ADDRESS = { line1: "1 Main St", city: "Sofia", country: "Bulgaria", timezone: "Europe/Sofia" };
const NOW = new Date("2026-10-20T12:00:00Z");

// RTDB drops empty arrays, so stored entries have no snapshot.tags / ageBands.
const storedEntry = (id: string) => ({
  id,
  at: "2026-10-19T10:00:00.000Z",
  eventId: "e1",
  signal: "liked",
  snapshot: { title: "Pumpkin day", category: "parks-outdoors", isFree: true, weekday: 6 },
});

function makeService(feedback: Record<string, unknown>) {
  const root: any = { eventFeedback: { u1: feedback } };
  const at = (path: string) => path.split("/").filter(Boolean).reduce((n: any, p) => (n == null ? undefined : n[p]), root);
  const deps: any = {
    get: async (path: string) => structuredClone(at(path) ?? null),
    set: async () => {},
    update: async () => {},
    remove: async () => {},
    push: async () => {},
    calendar: { listEvents: async () => [] },
    now: () => NOW,
  };
  return createEventsService(deps);
}

function register(events: ReturnType<typeof createEventsService>) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "patch", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  registerEventsServiceRoutes(app as Express, {
    events,
    profiles: { listSharingHouseholds: async () => [{ userId: "u1", address: ADDRESS, eventsSharing: { enabled: true, consentVersion: 1 } }] },
    getUserData: async () => ({ username: "ann", settings: { homeName: "Home" }, people: [] }),
    now: () => NOW,
  } as any);
  return routes;
}

async function call(routes: Map<string, Handler>, key: string) {
  const out: any = { status: 200, body: undefined };
  const res: any = {};
  await new Promise<void>((resolve) => {
    res.status = (c: number) => { out.status = c; return res; };
    res.json = (b: unknown) => { out.body = b; resolve(); return res; };
    res.end = () => { resolve(); return res; };
    routes.get(key)!({ headers: { "x-ff-auth": "service" }, query: {}, params: { householdId: "u1" }, body: {} }, res, () => {});
  });
  return out;
}

const feedback = () => ({ a: storedEntry("a"), bad: { id: "bad", at: "nope" } });

test("listFeedback defaults missing tags and skips malformed entries", async () => {
  const events = makeService(feedback());
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(String(m)); };
  try {
    const list = await events.listFeedback("u1");
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].snapshot.tags, []);
    assert.deepEqual(list[0].snapshot.ageBands, []);
  } finally {
    console.warn = orig;
  }
  assert.equal(warns.length, 1);
  assert.match(warns[0], /bad/);
});

test("GET households answers 200 with learned computed", async () => {
  const routes = register(makeService(feedback()));
  const out = await call(routes, "GET /api/service/events/households");
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.ok(out.body.households[0].learned);
});

test("GET household state answers 200 with learned computed", async () => {
  const routes = register(makeService(feedback()));
  const out = await call(routes, "GET /api/service/events/households/:householdId/state");
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.ok(out.body.learned);
  assert.equal(out.body.feedback.length, 1);
});
