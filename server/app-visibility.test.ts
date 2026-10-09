import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAppVisibilityRoutes } from "./app-visibility";
import { APP_IDS } from "@shared/apps";

type Handler = (req: any, res: any, next?: any) => unknown;

function setup(initialSettings: Record<string, unknown>) {
  const handlers: Record<string, Handler> = {};
  const recorder: any = {
    put: (p: string, h: Handler) => { handlers[`PUT ${p}`] = h; },
    post: (p: string, h: Handler) => { handlers[`POST ${p}`] = h; },
  };
  const updates: any[] = [];
  const deps = {
    getOrCreateUser: async () => ({ settings: initialSettings }) as any,
    updateUserData: async (_id: string, u: any) => { updates.push(u); },
  };
  registerAppVisibilityRoutes(recorder, deps);
  return { handlers, updates };
}

async function call(handler: Handler, opts: { appId: string; body: unknown; userId?: string }) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = {
      headers: opts.userId === undefined ? {} : { "x-clerk-user-id": opts.userId, "x-clerk-username": "u" },
      params: { appId: opts.appId },
      body: opts.body,
      method: "PUT",
      path: "/x",
    };
    let status = 200;
    const res: any = {
      status(s: number) { status = s; return res; },
      json(b: unknown) { resolve({ status, body: b }); return res; },
    };
    handler(req, res, () => {});
  });
}

const PUT = "PUT /api/settings/apps/:appId";
const MOVE = "POST /api/settings/apps/:appId/move";

test("PUT enables an app and persists only visibleApps", async () => {
  const { handlers, updates } = setup({ theme: "x", visibleApps: ["home", "settings", "clock"], appOrder: ["clock", "weather"] });
  const r = await call(handlers[PUT], { appId: "weather", body: { enabled: true }, userId: "u1" });
  assert.equal(r.status, 200);
  assert.ok(r.body.visibleApps.includes("weather"));
  assert.ok(r.body.visibleApps.includes("clock"));
  assert.equal(r.body.appOrder[0], "clock");
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0]), ["settings"]);
  assert.equal(updates[0].settings.theme, "x");
  assert.deepEqual(updates[0].settings.appOrder, ["clock", "weather"]);
});

test("PUT disables an app", async () => {
  const { handlers } = setup({ visibleApps: ["home", "settings", "clock", "weather"] });
  const r = await call(handlers[PUT], { appId: "clock", body: { enabled: false }, userId: "u1" });
  assert.equal(r.status, 200);
  assert.ok(!r.body.visibleApps.includes("clock"));
  assert.ok(r.body.visibleApps.includes("weather"));
});

test("PUT disabling last optional app keeps home and settings", async () => {
  const { handlers, updates } = setup({ visibleApps: ["home", "settings", "clock"] });
  const r = await call(handlers[PUT], { appId: "clock", body: { enabled: false }, userId: "u1" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.visibleApps, ["home", "settings"]);
  assert.deepEqual(updates[0].settings.visibleApps, ["home", "settings"]);
});

test("POST move up/down swaps neighbours and persists only appOrder", async () => {
  const order = ["clock", "weather", "photos"];
  const { handlers, updates } = setup({ visibleApps: ["home", "settings", "clock"], appOrder: order });
  const down = await call(handlers[MOVE], { appId: "clock", body: { direction: "down" }, userId: "u1" });
  assert.equal(down.status, 200);
  assert.deepEqual(down.body.appOrder.slice(0, 3), ["weather", "clock", "photos"]);
  assert.deepEqual(updates[0].settings.appOrder.slice(0, 3), ["weather", "clock", "photos"]);
  assert.deepEqual(updates[0].settings.visibleApps, ["home", "settings", "clock"]);
  const up = await call(handlers[MOVE], { appId: "photos", body: { direction: "up" }, userId: "u1" });
  assert.deepEqual(up.body.appOrder.slice(0, 3), ["clock", "photos", "weather"]);
});

test("unknown appId is 400", async () => {
  const { handlers, updates } = setup({});
  for (const h of [PUT, MOVE]) {
    const r = await call(handlers[h], { appId: "../evil", body: { enabled: true, direction: "up" }, userId: "u1" });
    assert.equal(r.status, 400);
  }
  assert.equal(updates.length, 0);
});

test("fixed apps are 400", async () => {
  const { handlers, updates } = setup({});
  for (const id of ["home", "settings"]) {
    assert.ok((APP_IDS as readonly string[]).includes(id));
    assert.equal((await call(handlers[PUT], { appId: id, body: { enabled: false }, userId: "u1" })).status, 400);
    assert.equal((await call(handlers[MOVE], { appId: id, body: { direction: "up" }, userId: "u1" })).status, 400);
  }
  assert.equal(updates.length, 0);
});

test("bad body is 400", async () => {
  const { handlers, updates } = setup({});
  assert.equal((await call(handlers[PUT], { appId: "clock", body: { enabled: "yes" }, userId: "u1" })).status, 400);
  assert.equal((await call(handlers[PUT], { appId: "clock", body: { enabled: true, extra: 1 }, userId: "u1" })).status, 400);
  assert.equal((await call(handlers[PUT], { appId: "clock", body: undefined, userId: "u1" })).status, 400);
  assert.equal((await call(handlers[MOVE], { appId: "clock", body: { direction: "left" }, userId: "u1" })).status, 400);
  assert.equal((await call(handlers[MOVE], { appId: "clock", body: { direction: "up", x: 1 }, userId: "u1" })).status, 400);
  assert.equal(updates.length, 0);
});

test("missing user is 401", async () => {
  const { handlers, updates } = setup({});
  assert.equal((await call(handlers[PUT], { appId: "clock", body: { enabled: true } })).status, 401);
  assert.equal((await call(handlers[MOVE], { appId: "clock", body: { direction: "up" } })).status, 401);
  assert.equal(updates.length, 0);
});
