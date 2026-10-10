import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerHouseholdRoutes } from "./household-routes";
import { HouseholdProfileError } from "./household-profile-service";

type Handler = (req: any, res: any, next?: any) => unknown;

const ADDRESS = { line1: "1 Main St", city: "Sofia", country: "Bulgaria" };

function setup(overrides: Record<string, any> = {}) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const service: any = {
    getProfile: async (...a: any[]) => (calls.push(["getProfile", ...a]), { eventsSharing: { enabled: false } }),
    putAddress: async (...a: any[]) => (calls.push(["putAddress", ...a]), { address: ADDRESS, eventsSharing: { enabled: false } }),
    setEventsSharing: async (...a: any[]) => (calls.push(["setEventsSharing", ...a]), { eventsSharing: { enabled: true } }),
    ...overrides,
  };
  const userDeps: any = {
    getOrCreateUser: async () => ({ settings: { homeName: "Home", location: { city: "Old", country: "Old" } } }),
    updateUserData: async (...a: any[]) => void calls.push(["updateUserData", ...a]),
  };
  registerHouseholdRoutes(app as Express, service, userDeps);
  return { routes, calls };
}

async function call(routes: Map<string, Handler>, key: string, req: any = {}) {
  const out: any = { status: 200, body: undefined };
  const res: any = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  await new Promise<void>((resolve) => {
    res.json = ((orig) => (b: unknown) => { orig(b); resolve(); return res; })(res.json);
    routes.get(key)!({ headers: { "x-clerk-user-id": "u1", "x-ff-auth": "session" }, query: {}, params: {}, body: {}, ...req }, res, () => {});
  });
  return out;
}

test("reads the profile", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "GET /api/household/profile");
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { eventsSharing: { enabled: false } });
  assert.deepEqual(calls[0], ["getProfile", "u1"]);
});

test("address save calls putAddress and syncs settings.location", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "PUT /api/household/address", { body: ADDRESS });
  assert.equal(out.status, 200);
  assert.deepEqual(calls[0], ["putAddress", "u1", ADDRESS]);
  assert.deepEqual(calls[1], ["updateUserData", "u1", {
    settings: { homeName: "Home", location: { city: "Sofia", country: "Bulgaria" } },
  }]);
});

test("invalid address is 400 and saves nothing", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "PUT /api/household/address", { body: { city: "Sofia" } });
  assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

test("sharing passes a 409 through", async () => {
  const { routes } = setup({
    setEventsSharing: async () => { throw new HouseholdProfileError("Add your address first", 409); },
  });
  const out = await call(routes, "PUT /api/household/events-sharing", { body: { enabled: true } });
  assert.equal(out.status, 409);
  assert.deepEqual(out.body, { error: "Add your address first" });
});

test("invalid sharing body is 400", async () => {
  const { routes } = setup();
  const out = await call(routes, "PUT /api/household/events-sharing", { body: { enabled: "yes" } });
  assert.equal(out.status, 400);
});

test("PAT and service requests are 403 on every route", async () => {
  const { routes } = setup();
  for (const kind of ["pat", "service"]) {
    for (const key of routes.keys()) {
      const out = await call(routes, key, { headers: { "x-clerk-user-id": "u1", "x-ff-auth": kind } });
      assert.equal(out.status, 403, `${key} ${kind}`);
    }
  }
});

test("missing user is 401 on every route", async () => {
  const { routes } = setup();
  for (const key of routes.keys()) {
    const out = await call(routes, key, { headers: { "x-ff-auth": "session" } });
    assert.equal(out.status, 401, key);
  }
});
