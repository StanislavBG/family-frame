import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerTokenRoutes } from "./routes";
import type { ApiTokenRecord, TokenStore } from "./api-tokens";

type Handler = (req: any, res: any, next?: any) => unknown;

function setup() {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "patch", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const rec = (id: string, userId: string): ApiTokenRecord =>
    ({ id, userId, name: "t", scopes: ["mail:read"], createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null }) as any;
  const data = new Map<string, ApiTokenRecord>([
    ["hash-a", rec("a", "u1")],
    ["hash-b", rec("b", "u2")],
  ]);
  const store: TokenStore = {
    listByUser: async (userId: string) =>
      [...data].filter(([, r]) => r.userId === userId).map(([hash, r]) => ({ hash, rec: r })),
    set: async (hash: string, r: ApiTokenRecord) => void data.set(hash, r),
    remove: async (hash: string) => void data.delete(hash),
  } as any;
  registerTokenRoutes(app as Express, store);
  return { routes, data };
}

async function patch(routes: Map<string, Handler>, req: any) {
  const out: any = { status: 200, body: undefined };
  await new Promise<void>((resolve, reject) => {
    const res: any = {
      status(c: number) { out.status = c; return res; },
      json(b: unknown) { out.body = b; resolve(); return res; },
    };
    const h = routes.get("PATCH /api/tokens/:id")!;
    Promise.resolve(h({ headers: { "x-clerk-user-id": "u1" }, params: { id: "a" }, body: { scopes: ["mail:write"] }, ...req }, res, reject)).catch(reject);
  });
  return out;
}

test("registers PATCH between POST and DELETE", () => {
  assert.deepEqual([...setup().routes.keys()], [
    "GET /api/tokens", "POST /api/tokens/new", "PATCH /api/tokens/:id", "DELETE /api/tokens/:id",
  ]);
});

test("401 without a user", async () => {
  const { routes } = setup();
  assert.equal((await patch(routes, { headers: {} })).status, 401);
});

test("403 for PAT requests", async () => {
  const { routes } = setup();
  const r = await patch(routes, { headers: { "x-clerk-user-id": "u1", "x-ff-auth": "pat" } });
  assert.equal(r.status, 403);
});

test("400 for invalid scope or empty scopes", async () => {
  const { routes } = setup();
  const r = await patch(routes, { body: { scopes: ["nope"] } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Invalid token data");
  assert.ok(r.body.details);
  assert.equal((await patch(routes, { body: { scopes: [] } })).status, 400);
});

test("404 for unknown id and another user's token", async () => {
  const { routes } = setup();
  for (const id of ["missing", "b"]) {
    const r = await patch(routes, { params: { id } });
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: "Token not found" });
  }
});

test("200 returns updated record without secret or hash", async () => {
  const { routes, data } = setup();
  const r = await patch(routes, { body: { scopes: ["mail:write", "mail:write"] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, "a");
  assert.deepEqual(r.body.scopes, ["mail:write"]);
  assert.equal("hash" in r.body || "token" in r.body, false);
  assert.deepEqual(data.get("hash-a")!.scopes, ["mail:write"]);
});
