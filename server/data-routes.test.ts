import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerDataRoutes } from "./data-routes";
import { DatasetError, type DatasetService } from "./dataset-service";

type Handler = (req: any, res: any, next?: any) => unknown;

function setup(overrides: Partial<DatasetService> = {}) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  const calls: any[] = [];
  const service: any = {
    listSchemas: async () => [{ id: "s" }],
    putSchema: async (...a: any[]) => (calls.push(["putSchema", ...a]), { id: "s" }),
    getSchema: async () => ({ id: "s" }),
    deleteSchema: async () => undefined,
    putRecords: async (...a: any[]) => (calls.push(["putRecords", ...a]), { created: 1, updated: 0, ids: ["r"] }),
    listRecords: async (...a: any[]) => (calls.push(["listRecords", ...a]), { records: [], total: 0 }),
    getRecord: async () => ({ id: "r" }),
    deleteRecord: async () => undefined,
    ...overrides,
  };
  registerDataRoutes(app as Express, service as DatasetService);
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

test("registers the eight routes in order", () => {
  assert.deepEqual([...setup().routes.keys()], [
    "GET /api/data/schemas",
    "PUT /api/data/schemas/:schemaId",
    "GET /api/data/schemas/:schemaId",
    "DELETE /api/data/schemas/:schemaId",
    "POST /api/data/records/:schemaId",
    "GET /api/data/records/:schemaId",
    "GET /api/data/records/:schemaId/:recordId",
    "DELETE /api/data/records/:schemaId/:recordId",
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

test("DatasetError maps to its status", async () => {
  const { routes } = setup({
    putSchema: async () => { throw new DatasetError("bad schema", 400); },
    getSchema: async () => { throw new DatasetError("Schema not found", 404); },
    deleteRecord: async () => { throw new DatasetError("Record not found", 404); },
  });
  const bad = await call(routes, "PUT /api/data/schemas/:schemaId", { params: { schemaId: "s" } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body, { error: "bad schema" });
  const missing = await call(routes, "GET /api/data/schemas/:schemaId", { params: { schemaId: "s" } });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "Schema not found" });
  const del = await call(routes, "DELETE /api/data/records/:schemaId/:recordId", { params: { schemaId: "s", recordId: "r" } });
  assert.equal(del.status, 404);
});

test("unexpected errors give 500", async () => {
  const { routes } = setup({ listSchemas: async () => { throw new Error("boom"); } });
  const out = await call(routes, "GET /api/data/schemas");
  assert.equal(out.status, 500);
  assert.deepEqual(out.body, { error: "Internal server error" });
});

test("success shapes", async () => {
  const { routes, calls } = setup();
  assert.deepEqual((await call(routes, "GET /api/data/schemas")).body, [{ id: "s" }]);
  assert.deepEqual((await call(routes, "PUT /api/data/schemas/:schemaId", { params: { schemaId: "s" }, body: { a: 1 } })).body, { id: "s" });
  assert.deepEqual(calls.find((c) => c[0] === "putSchema")!.slice(1), ["u1", "s", { a: 1 }]);
  assert.deepEqual((await call(routes, "GET /api/data/schemas/:schemaId", { params: { schemaId: "s" } })).body, { id: "s" });
  const del = await call(routes, "DELETE /api/data/schemas/:schemaId", { params: { schemaId: "s" } });
  assert.equal(del.status, 204);
  assert.equal(del.ended, true);
  assert.deepEqual((await call(routes, "POST /api/data/records/:schemaId", { params: { schemaId: "s" }, body: { records: [] } })).body,
    { created: 1, updated: 0, ids: ["r"] });
  assert.deepEqual(calls.find((c) => c[0] === "putRecords")!.slice(1), ["u1", "s", { records: [] }]);
  assert.deepEqual((await call(routes, "GET /api/data/records/:schemaId", { params: { schemaId: "s" }, query: { emailId: "e", limit: "5", offset: "2" } })).body,
    { records: [], total: 0 });
  assert.deepEqual(calls.find((c) => c[0] === "listRecords")!.slice(1), ["u1", "s", { emailId: "e", limit: 5, offset: 2 }]);
  assert.deepEqual((await call(routes, "GET /api/data/records/:schemaId/:recordId", { params: { schemaId: "s", recordId: "r" } })).body, { id: "r" });
  const delRec = await call(routes, "DELETE /api/data/records/:schemaId/:recordId", { params: { schemaId: "s", recordId: "r" } });
  assert.equal(delRec.status, 204);
  assert.equal(delRec.ended, true);
});
