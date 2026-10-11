import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimeSeriesService, TimeSeriesError } from "./time-series-service";
import { TS_LIMITS } from "@shared/time-series";

// Map-backed fake: nested object tree addressed by slash paths, like RTDB.
function makeDeps() {
  const root: any = {};
  const walk = (path: string, create: boolean) => {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (const p of parts.slice(0, -1)) {
      if (node[p] === undefined) {
        if (!create) return [undefined, ""] as const;
        node[p] = {};
      }
      node = node[p];
    }
    return [node, parts[parts.length - 1]] as const;
  };
  let tick = 0;
  const deps = {
    async get(path: string) {
      const [n, k] = walk(path, false);
      return n && n[k] !== undefined ? structuredClone(n[k]) : null;
    },
    async set(path: string, value: any) {
      const [n, k] = walk(path, true);
      n[k] = structuredClone(value);
    },
    async update(path: string, values: Record<string, any>) {
      for (const [k, v] of Object.entries(values)) {
        if (v === null) await deps.remove(`${path}/${k}`);
        else await deps.set(`${path}/${k}`, v);
      }
    },
    async remove(path: string) {
      const [n, k] = walk(path, false);
      if (n) delete n[k];
    },
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
  };
  return { deps, root };
}

async function rejects(p: Promise<unknown>, status: number, re?: RegExp) {
  await assert.rejects(p, (e: any) => e instanceof TimeSeriesError && e.status === status && (!re || re.test(e.message)));
}

const base = { title: "Electric" };

test("putSeries creates with defaults, preserves createdAt and stats on replace", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  const a = await svc.putSeries("u1", "electric", base);
  assert.deepEqual(
    { ...a, createdAt: undefined, updatedAt: undefined },
    {
      id: "electric",
      title: "Electric",
      description: "",
      summary: "",
      tags: [],
      unit: null,
      color: null,
      annotations: {},
      createdAt: undefined,
      updatedAt: undefined,
      pointCount: 0,
      firstT: null,
      lastT: null,
      latest: null,
    },
  );
  await svc.putPoints("u1", "electric", { points: [{ t: "2026-01-01", value: 5 }] });
  const b = await svc.putSeries("u1", "electric", {
    title: "Electric 2",
    tags: ["bills", "home"],
    unit: "USD",
    annotations: { "a.b": 1, $x: [2] },
  });
  assert.equal(b.createdAt, a.createdAt);
  assert.notEqual(b.updatedAt, a.updatedAt);
  assert.equal(b.pointCount, 1);
  assert.equal(b.firstT, "2026-01-01");
  assert.deepEqual(b.latest, { t: "2026-01-01", value: 5 });
  assert.deepEqual(b.annotations, { "a.b": 1, $x: [2] });
  assert.equal(typeof root.timeSeries.u1.series.electric.annotationsJson, "string");
  assert.equal(root.timeSeries.u1.series.electric.annotations, undefined);
  // replace drops omitted optional fields
  const c = await svc.putSeries("u1", "electric", base);
  assert.deepEqual([c.tags, c.unit, c.annotations], [[], null, {}]);
});

test("getSeries normalizes missing RTDB fields; 404 when absent", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  await rejects(svc.getSeries("u1", "nope"), 404);
  root.timeSeries = { u1: { series: { s: { id: "s", title: "S", createdAt: "x", updatedAt: "x", pointCount: 0 } } } };
  const s = await svc.getSeries("u1", "s");
  assert.deepEqual([s.tags, s.unit, s.latest, s.annotations, s.description, s.firstT], [[], null, null, {}, "", null]);
});

test("validation: bad id and bad input are 400", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await rejects(svc.putSeries("u1", "Bad/../id", base), 400);
  await rejects(svc.getSeries("u1", "../x"), 400);
  await rejects(svc.putSeries("u1", "ok", { title: "" }), 400);
  await rejects(svc.putSeries("u1", "ok", { title: "t", extra: 1 } as any), 400);
  await svc.putSeries("u1", "ok", base);
  await rejects(svc.putPoints("u1", "ok", { points: [{ t: "nope", value: 1 }] }), 400);
  await rejects(svc.putPoints("u1", "ok", { points: [] }), 400);
  await rejects(svc.deletePoint("u1", "ok", "bad-t"), 400);
});

test("missing series is 404 for delete, putPoints, listPoints, deletePoint", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await rejects(svc.deleteSeries("u1", "x"), 404);
  await rejects(svc.putPoints("u1", "x", { points: [{ t: "2026-01-01", value: 1 }] }), 404);
  await rejects(svc.listPoints("u1", "x", {}), 404);
  await rejects(svc.deletePoint("u1", "x", "2026-01-01"), 404);
});

test("series cap: number max+1 is 409, replacing an existing one is fine", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  const series: any = {};
  for (let i = 0; i < TS_LIMITS.seriesPerUserMax; i++) series[`s${i}`] = { id: `s${i}`, title: `S${i}` };
  root.timeSeries = { u1: { series } };
  await rejects(svc.putSeries("u1", "extra", base), 409);
  await svc.putSeries("u1", "s0", base);
});

test("putPoints upserts by t, returns counts, maintains stats ordered by time", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  await svc.putSeries("u1", "s", base);
  const r1 = await svc.putPoints("u1", "s", {
    points: [
      { t: "2026-03-01", value: 3 },
      { t: "2026-01-01", value: 1, label: "jan", annotations: { k: "v" } },
      { t: "2026-02-01T10:00:00.500Z", value: 2 },
    ],
  });
  assert.deepEqual(r1, { upserted: 3, pointCount: 3 });
  const r2 = await svc.putPoints("u1", "s", { points: [{ t: "2026-03-01", value: 30 }, { t: "2026-03-01", value: 31 }] });
  assert.deepEqual(r2, { upserted: 1, pointCount: 3 });
  const s = await svc.getSeries("u1", "s");
  assert.deepEqual([s.pointCount, s.firstT, s.lastT, s.latest], [3, "2026-01-01", "2026-03-01", { t: "2026-03-01", value: 31 }]);
  assert.equal(root.timeSeries.u1.points.s["2026-02-01T10:00:00_500Z"].t, "2026-02-01T10:00:00.500Z");
  const pts = await svc.listPoints("u1", "s", {});
  assert.deepEqual(pts.map((p) => p.t), ["2026-01-01", "2026-02-01T10:00:00.500Z", "2026-03-01"]);
  assert.deepEqual(pts[0], { t: "2026-01-01", value: 1, label: "jan", annotations: { k: "v" } });
  assert.deepEqual(pts[2], { t: "2026-03-01", value: 31 });
});

test("putPoints over pointsPerSeriesMax is 400 and writes nothing", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  await svc.putSeries("u1", "s", base);
  const pts: any = {};
  for (let i = 0; i < TS_LIMITS.pointsPerSeriesMax - 1; i++) pts[`p${i}`] = { t: "2026-01-01", value: i };
  root.timeSeries.u1.points = { s: pts };
  await rejects(
    svc.putPoints("u1", "s", { points: [{ t: "2027-01-01", value: 1 }, { t: "2027-01-02", value: 2 }] }),
    400,
  );
  assert.equal(Object.keys(root.timeSeries.u1.points.s).length, TS_LIMITS.pointsPerSeriesMax - 1);
  // one new point still fits
  const r = await svc.putPoints("u1", "s", { points: [{ t: "2027-01-01", value: 1 }] });
  assert.equal(r.pointCount, TS_LIMITS.pointsPerSeriesMax);
});

test("deletePoint recomputes stats; clearing all resets them", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await svc.putSeries("u1", "s", base);
  await svc.putPoints("u1", "s", { points: [{ t: "2026-01-01", value: 1 }, { t: "2026-01-02", value: 2 }] });
  await svc.deletePoint("u1", "s", "2026-01-02");
  let s = await svc.getSeries("u1", "s");
  assert.deepEqual([s.pointCount, s.lastT, s.latest], [1, "2026-01-01", { t: "2026-01-01", value: 1 }]);
  await rejects(svc.deletePoint("u1", "s", "2026-01-02"), 404);
  await svc.deletePoint("u1", "s", "2026-01-01");
  s = await svc.getSeries("u1", "s");
  assert.deepEqual([s.pointCount, s.firstT, s.lastT, s.latest], [0, null, null, null]);
});

test("listPoints filters by from/to by time, caps to the newest", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await svc.putSeries("u1", "s", base);
  await svc.putPoints("u1", "s", {
    points: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"].map((t, i) => ({ t, value: i })),
  });
  const mid = await svc.listPoints("u1", "s", { from: "2026-01-02", to: "2026-01-03T00:00:00Z" });
  assert.deepEqual(mid.map((p) => p.t), ["2026-01-02", "2026-01-03"]);
  const capped = await svc.listPoints("u1", "s", { limit: 2 });
  assert.deepEqual(capped.map((p) => p.t), ["2026-01-03", "2026-01-04"]);
  await rejects(svc.listPoints("u1", "s", { from: "garbage" }), 400);
});

test("listSeries filters by tag sorted by title; listTags counts sorted by tag", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await svc.putSeries("u1", "w", { title: "Water", tags: ["utilities", "home"] });
  await svc.putSeries("u1", "e", { title: "Electric", tags: ["utilities"] });
  await svc.putSeries("u1", "x", { title: "Other" });
  assert.deepEqual((await svc.listSeries("u1", {})).map((s) => s.id), ["e", "x", "w"]);
  assert.deepEqual((await svc.listSeries("u1", { tag: "utilities" })).map((s) => s.id), ["e", "w"]);
  assert.deepEqual((await svc.listSeries("u1", { tag: "nope" })), []);
  assert.deepEqual(await svc.listTags("u1"), [
    { tag: "home", count: 1 },
    { tag: "utilities", count: 2 },
  ]);
});

test("deleteSeries removes series and its points", async () => {
  const { deps, root } = makeDeps();
  const svc = createTimeSeriesService(deps);
  await svc.putSeries("u1", "s", base);
  await svc.putPoints("u1", "s", { points: [{ t: "2026-01-01", value: 1 }] });
  await svc.deleteSeries("u1", "s");
  assert.equal(root.timeSeries.u1.series.s, undefined);
  assert.equal(root.timeSeries.u1.points.s, undefined);
  await rejects(svc.getSeries("u1", "s"), 404);
});

test("users are isolated", async () => {
  const svc = createTimeSeriesService(makeDeps().deps);
  await svc.putSeries("A", "s", { ...base, tags: ["t"] });
  await svc.putPoints("A", "s", { points: [{ t: "2026-01-01", value: 1 }] });
  await rejects(svc.getSeries("B", "s"), 404);
  await rejects(svc.listPoints("B", "s", {}), 404);
  await rejects(svc.deleteSeries("B", "s"), 404);
  assert.deepEqual(await svc.listSeries("B", {}), []);
  assert.deepEqual(await svc.listTags("B"), []);
  assert.equal((await svc.getSeries("A", "s")).pointCount, 1);
});
