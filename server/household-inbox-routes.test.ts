import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerHouseholdInboxRoutes } from "./household-inbox-routes";
import { HouseholdInboxError } from "./household-inbox-service";

type Handler = (req: any, res: any, next?: any) => unknown;

const BASE = "family@gmail.com";
const STATE = { enabled: true, key: "abcdefghij", sources: [], organize: { enabled: false } };
const PEOPLE = [
  { id: "p1", name: "Ana María" },
  { id: "p2", name: "!!!" },
];

function setup(overrides: Record<string, any> = {}, base: string | null = BASE, state: any = STATE, organizeDeps: any = {}) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const service: any = {
    getState: async (...a: any[]) => (calls.push(["getState", ...a]), state),
    enable: async (...a: any[]) => (calls.push(["enable", ...a]), STATE),
    disable: async (...a: any[]) => (calls.push(["disable", ...a]), { ...STATE, enabled: false }),
    rotate: async (...a: any[]) => (calls.push(["rotate", ...a]), STATE),
    setSourceStatus: async (...a: any[]) => (calls.push(["setSourceStatus", ...a]), STATE),
    setOrganize: async (...a: any[]) => (calls.push(["setOrganize", ...a]), STATE),
    deliver: async (...a: any[]) => (calls.push(["deliver", ...a]), { status: "unknown" }),
    ...overrides,
  };
  registerHouseholdInboxRoutes(app as Express, service, {
    inboxAddress: () => base ?? undefined,
    getPeople: async () => PEOPLE,
  }, organizeDeps);
  return { routes, calls };
}

async function call(routes: Map<string, Handler>, key: string, req: any = {}, auth = "session") {
  const out: any = { status: 200, body: undefined };
  const res: any = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  const headers: Record<string, string> = { "x-ff-auth": auth };
  if (auth === "session") headers["x-clerk-user-id"] = "u1";
  await new Promise<void>((resolve) => {
    res.json = ((orig) => (b: unknown) => { orig(b); resolve(); return res; })(res.json);
    routes.get(key)!({ headers, query: {}, params: {}, body: {}, ...req }, res, () => {});
  });
  return out;
}

const SESSION_ROUTES = [
  "GET /api/household/inbox",
  "PUT /api/household/inbox/enabled",
  "POST /api/household/inbox/rotate",
  "PUT /api/household/inbox/sources",
  "PUT /api/household/inbox/organize",
];

test("session routes: 401 without a user, 403 unless session", async () => {
  const { routes, calls } = setup();
  for (const key of SESSION_ROUTES) {
    assert.equal((await call(routes, key, { headers: {} })).status, 401, key);
    assert.equal((await call(routes, key, { headers: { "x-clerk-user-id": "u1", "x-ff-auth": "pat" } })).status, 403, key);
  }
  assert.equal(calls.length, 0);
});

test("GET is { configured: false } when the base address is unset or invalid", async () => {
  for (const base of [null, "not-an-email"]) {
    const { routes } = setup({}, base);
    const out = await call(routes, "GET /api/household/inbox");
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { configured: false });
  }
});

test("GET returns state with addresses, omitting empty person slugs", async () => {
  const { routes } = setup();
  const out = await call(routes, "GET /api/household/inbox");
  assert.equal(out.body.configured, true);
  assert.equal(out.body.key, "abcdefghij");
  assert.equal(out.body.address, "family+abcdefghij@gmail.com");
  assert.deepEqual(out.body.people, [
    { id: "p1", name: "Ana María", address: "family+abcdefghij-anamaria@gmail.com" },
  ]);
});

test("GET omits address fields when disabled", async () => {
  const { routes } = setup({}, BASE, { ...STATE, enabled: false });
  const out = await call(routes, "GET /api/household/inbox");
  assert.equal(out.body.configured, true);
  assert.equal(out.body.enabled, false);
  assert.equal("address" in out.body, false);
  assert.deepEqual(out.body.people, []);
});

test("enabled toggles enable/disable and returns state", async () => {
  const { routes, calls } = setup();
  const on = await call(routes, "PUT /api/household/inbox/enabled", { body: { enabled: true } });
  assert.equal(on.status, 200);
  assert.equal(on.body.configured, true);
  const off = await call(routes, "PUT /api/household/inbox/enabled", { body: { enabled: false } });
  assert.equal(off.status, 200);
  assert.deepEqual(calls.filter((c) => c[0] !== "getState").map((c) => c[0]), ["enable", "disable"]);
  assert.equal((await call(routes, "PUT /api/household/inbox/enabled", { body: { enabled: "yes" } })).status, 400);
});

test("rotate calls the service", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "POST /api/household/inbox/rotate");
  assert.equal(out.status, 200);
  assert.deepEqual(calls[0], ["rotate", "u1"]);
});

test("sources validates and sets status", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "PUT /api/household/inbox/sources", { body: { email: "a@b.co", status: "approved" } });
  assert.equal(out.status, 200);
  assert.deepEqual(calls[0], ["setSourceStatus", "u1", "a@b.co", "approved"]);
  const bad = await call(routes, "PUT /api/household/inbox/sources", { body: { email: "a@b.co", status: "pending" } });
  assert.equal(bad.status, 400);
});

test("organize sets consent", async () => {
  const { routes, calls } = setup();
  const out = await call(routes, "PUT /api/household/inbox/organize", { body: { enabled: true } });
  assert.equal(out.status, 200);
  assert.deepEqual(calls[0], ["setOrganize", "u1", true]);
});

test("HouseholdInboxError maps to its status", async () => {
  const { routes } = setup({ rotate: async () => { throw new HouseholdInboxError("not set up", 404); } });
  const out = await call(routes, "POST /api/household/inbox/rotate");
  assert.equal(out.status, 404);
  assert.deepEqual(out.body, { error: "not set up" });
});

test("deliver: 403 unless service", async () => {
  const { routes, calls } = setup();
  assert.equal((await call(routes, "POST /api/service/inbox/deliver", {}, "session")).status, 403);
  assert.equal(calls.length, 0);
});

test("deliver: 400 with issues on a bad body (zod from service)", async () => {
  const { deliverRequestSchema } = await import("../shared/household-inbox");
  const { routes } = setup({ deliver: async (i: unknown) => deliverRequestSchema.parse(i) });
  const out = await call(routes, "POST /api/service/inbox/deliver", { body: { nope: 1 } }, "service");
  assert.equal(out.status, 400);
  assert.ok(Array.isArray(out.body.details));
});

test("deliver: 200 with the service result, unknown included", async () => {
  const { routes, calls } = setup();
  const body = { key: "abcdefghij" };
  const out = await call(routes, "POST /api/service/inbox/deliver", { body }, "service");
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { status: "unknown" });
  assert.deepEqual(calls[0], ["deliver", body]);
});

const ORGANIZED = "POST /api/service/inbox/households/:householdId/organized";
const ORG_STATE = { ...STATE, organize: { enabled: true } };

test("organized: 403 unless service", async () => {
  const { routes, calls } = setup({}, BASE, ORG_STATE);
  assert.equal((await call(routes, ORGANIZED, { params: { householdId: "h1" } }, "session")).status, 403);
  assert.equal(calls.length, 0);
});

test("organized: 404 when organize is off or the inbox is disabled", async () => {
  for (const state of [STATE, { ...ORG_STATE, enabled: false }]) {
    const { routes } = setup({}, BASE, state);
    const out = await call(routes, ORGANIZED, { params: { householdId: "h1" } }, "service");
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { error: "Household not found" });
  }
});

test("organized: 200 passes householdId and body to applyOrganized", async () => {
  const mailCalls: any[] = [];
  const organizeDeps = {
    mail: {
      getEmail: async (...a: any[]) => (mailCalls.push(["getEmail", ...a]), { id: "hh-1" }),
      upsertEmails: async () => ({}),
    },
    series: {},
    datasets: {},
    getPeople: async () => PEOPLE,
  };
  const { routes, calls } = setup({}, BASE, ORG_STATE, organizeDeps);
  const body = { mailId: "hh-1", kind: "other" };
  const out = await call(routes, ORGANIZED, { params: { householdId: "h1" }, body }, "service");
  assert.deepEqual(calls[0], ["getState", "h1"]);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { applied: "none" });
  assert.deepEqual(mailCalls[0], ["getEmail", "h1", "hh-1"]);
});

test("organized: 400 on a bad body", async () => {
  const { routes } = setup({}, BASE, ORG_STATE);
  const out = await call(routes, ORGANIZED, { params: { householdId: "h1" }, body: { nope: 1 } }, "service");
  assert.equal(out.status, 400);
});
