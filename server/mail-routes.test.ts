import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerMailRoutes } from "./mail-routes";
import { MailError, type MailService } from "./mail-service";

type Handler = (req: any, res: any, next?: any) => unknown;

function setup(overrides: Partial<MailService> = {}) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const service: any = {
    upsertEmails: async (...a: any[]) => (calls.push(["upsert", ...a]), { created: 1, updated: 0, ids: ["a"], pruned: 0 }),
    listEmails: async (...a: any[]) => (calls.push(["list", ...a]), { emails: [], nextBefore: null }),
    getEmail: async () => null,
    setRead: async (...a: any[]) => (calls.push(["read", ...a]), { updated: 2 }),
    deleteEmail: async () => false,
    unreadCount: async () => 3,
    ...overrides,
  };
  registerMailRoutes(app as Express, service as MailService);
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
    h({ headers: { "x-clerk-user-id": "u1" }, query: {}, params: {}, body: {}, method: "X", path: "/", ...req }, res, () => {});
  });
  return out;
}

test("registers the six routes in order", () => {
  assert.deepEqual([...setup().routes.keys()], [
    "POST /api/mail/messages",
    "GET /api/mail/messages",
    "GET /api/mail/unread-count",
    "POST /api/mail/messages/read",
    "GET /api/mail/messages/:id",
    "DELETE /api/mail/messages/:id",
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

test("MailError maps to its status", async () => {
  const { routes } = setup({ upsertEmails: async () => { throw new MailError("bad", 400); } });
  const out = await call(routes, "POST /api/mail/messages", { body: { emails: [] } });
  assert.equal(out.status, 400);
  assert.deepEqual(out.body, { error: "bad" });
});

test("unexpected errors give 500", async () => {
  const { routes } = setup({ unreadCount: async () => { throw new Error("boom"); } });
  const out = await call(routes, "GET /api/mail/unread-count");
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: "Internal server error" });
});

test("success shapes", async () => {
  const { routes, calls } = setup();
  assert.deepEqual((await call(routes, "POST /api/mail/messages", { body: { emails: [] } })).body,
    { created: 1, updated: 0, ids: ["a"], pruned: 0 });
  assert.deepEqual((await call(routes, "GET /api/mail/messages", { query: { limit: "5", unread: "1", q: "x" } })).body,
    { emails: [], nextBefore: null });
  assert.deepEqual(calls.find((c) => c[0] === "list")!.slice(1), ["u1", {
    limit: 5, before: undefined, label: undefined, kind: undefined, unreadOnly: true, q: "x",
  }]);
  assert.deepEqual((await call(routes, "GET /api/mail/unread-count")).body, { count: 3 });
  assert.deepEqual((await call(routes, "POST /api/mail/messages/read", { body: { ids: ["a"] } })).body, { updated: 2 });
  assert.deepEqual(calls.find((c) => c[0] === "read")!.slice(1), ["u1", ["a"], true]);
});

test("read body validation gives 400", async () => {
  const { routes } = setup();
  const out = await call(routes, "POST /api/mail/messages/read", { body: { ids: [] } });
  assert.equal(out.status, 400);
});

test("get/delete 404 and success", async () => {
  const { routes } = setup();
  assert.equal((await call(routes, "GET /api/mail/messages/:id", { params: { id: "x" } })).status, 404);
  assert.equal((await call(routes, "DELETE /api/mail/messages/:id", { params: { id: "x" } })).status, 404);
  const ok = setup({ getEmail: async () => ({ id: "x" }) as any, deleteEmail: async () => true });
  assert.deepEqual((await call(ok.routes, "GET /api/mail/messages/:id", { params: { id: "x" } })).body, { id: "x" });
  const del = await call(ok.routes, "DELETE /api/mail/messages/:id", { params: { id: "x" } });
  assert.equal(del.status, 204);
  assert.equal(del.ended, true);
});
