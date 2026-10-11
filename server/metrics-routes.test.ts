import { test } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import { registerMetricsRoutes } from "./metrics-routes";
import { createTimeSeriesService, type TimeSeriesDeps } from "./time-series-service";

type Handler = (req: any, res: any, next?: any) => unknown;

// In-memory RTDB stand-in: nested objects addressed by slash paths.
function memoryDeps(): TimeSeriesDeps {
  const root: any = {};
  const walk = (path: string, create: boolean) => {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (node[part] === undefined || node[part] === null) {
        if (!create) return { parent: undefined, key: parts[parts.length - 1] };
        node[part] = {};
      }
      node = node[part];
    }
    return { parent: node, key: parts[parts.length - 1] };
  };
  return {
    async get(path) {
      const { parent, key } = walk(path, false);
      const v = parent?.[key];
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    },
    async set(path, value) {
      const { parent, key } = walk(path, true);
      parent[key] = JSON.parse(JSON.stringify(value));
    },
    async update(path, values) {
      const { parent, key } = walk(path, true);
      parent[key] ??= {};
      for (const [k, v] of Object.entries(values)) {
        if (v === null) delete parent[key][k];
        else parent[key][k] = JSON.parse(JSON.stringify(v));
      }
    },
    async remove(path) {
      const { parent, key } = walk(path, false);
      if (parent) delete parent[key];
    },
  };
}

function setup() {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const m of ["get", "post", "put", "delete"]) {
    app[m] = (path: string, h: Handler) => routes.set(`${m.toUpperCase()} ${path}`, h);
  }
  registerMetricsRoutes(app as Express, createTimeSeriesService(memoryDeps()));
  return routes;
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

const SERIES = "PUT /api/metrics/series/:seriesId";
const POINTS = "/api/metrics/series/:seriesId/points";

test("registers the eight routes in order", () => {
  assert.deepEqual([...setup().keys()], [
    "GET /api/metrics/tags",
    "GET /api/metrics/series",
    SERIES,
    "GET /api/metrics/series/:seriesId",
    "DELETE /api/metrics/series/:seriesId",
    `POST ${POINTS}`,
    `GET ${POINTS}`,
    `DELETE ${POINTS}`,
  ]);
});

test("401 without x-clerk-user-id on every route", async () => {
  const routes = setup();
  for (const key of routes.keys()) {
    const out = await call(routes, key, { headers: {} });
    assert.equal(out.status, 401, key);
    assert.deepEqual(out.body, { error: "Unauthorized" });
  }
});

test("PUT series then GET round trip", async () => {
  const routes = setup();
  const put = await call(routes, SERIES, {
    params: { seriesId: "power" },
    body: { title: "Power", tags: ["utilities"], unit: "USD" },
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.id, "power");
  const got = await call(routes, "GET /api/metrics/series/:seriesId", { params: { seriesId: "power" } });
  assert.equal(got.body.title, "Power");
  assert.deepEqual(got.body.tags, ["utilities"]);
  const list = await call(routes, "GET /api/metrics/series", { query: { tag: "utilities" } });
  assert.equal(list.body.length, 1);
  const none = await call(routes, "GET /api/metrics/series", { query: { tag: "other" } });
  assert.equal(none.body.length, 0);
  const tags = await call(routes, "GET /api/metrics/tags");
  assert.deepEqual(tags.body, [{ tag: "utilities", count: 1 }]);
});

test("POST points then GET with from/to/limit", async () => {
  const routes = setup();
  await call(routes, SERIES, { params: { seriesId: "power" }, body: { title: "Power", tags: [] } });
  const post = await call(routes, `POST ${POINTS}`, {
    params: { seriesId: "power" },
    body: { points: [
      { t: "2026-01-01", value: 1 },
      { t: "2026-02-01", value: 2 },
      { t: "2026-03-01", value: 3 },
    ] },
  });
  assert.equal(post.status, 200);
  assert.equal(post.body.pointCount, 3);
  const params = { seriesId: "power" };
  const all = await call(routes, `GET ${POINTS}`, { params });
  assert.deepEqual(all.body.map((p: any) => p.value), [1, 2, 3]);
  const range = await call(routes, `GET ${POINTS}`, { params, query: { from: "2026-02-01", to: "2026-03-01" } });
  assert.deepEqual(range.body.map((p: any) => p.value), [2, 3]);
  const limited = await call(routes, `GET ${POINTS}`, { params, query: { limit: "2" } });
  assert.deepEqual(limited.body.map((p: any) => p.value), [2, 3]);
});

test("unknown series gives 404", async () => {
  const routes = setup();
  const out = await call(routes, "GET /api/metrics/series/:seriesId", { params: { seriesId: "nope" } });
  assert.equal(out.status, 404);
  assert.deepEqual(out.body, { error: "Series not found" });
});

test("invalid body gives 400", async () => {
  const routes = setup();
  const out = await call(routes, SERIES, { params: { seriesId: "power" }, body: { tags: "nope" } });
  assert.equal(out.status, 400);
  assert.equal(typeof out.body.error, "string");
});

test("DELETE point by t gives 204, then 404", async () => {
  const routes = setup();
  const params = { seriesId: "power" };
  await call(routes, SERIES, { params, body: { title: "Power", tags: [] } });
  await call(routes, `POST ${POINTS}`, { params, body: { points: [{ t: "2026-01-01", value: 1 }, { t: "2026-02-01", value: 2 }] } });
  const del = await call(routes, `DELETE ${POINTS}`, { params, query: { t: "2026-01-01" } });
  assert.equal(del.status, 204);
  assert.equal(del.ended, true);
  const left = await call(routes, `GET ${POINTS}`, { params });
  assert.deepEqual(left.body.map((p: any) => p.value), [2]);
  const again = await call(routes, `DELETE ${POINTS}`, { params, query: { t: "2026-01-01" } });
  assert.equal(again.status, 404);
  const missingT = await call(routes, `DELETE ${POINTS}`, { params });
  assert.equal(missingT.status, 400);
});
