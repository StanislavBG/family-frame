import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatasetService, DatasetError } from "./dataset-service";
import { DATA_LIMITS } from "@shared/agent-data";
import { PERSON_DAY_SCHEMA_ID, PERSON_WEEK_SCHEMA_ID } from "@shared/person-views";

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
      for (const [k, v] of Object.entries(values)) await deps.set(`${path}/${k}`, v);
    },
    async remove(path: string) {
      const [n, k] = walk(path, false);
      if (n) delete n[k];
    },
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
  };
  return { deps, root };
}

const jsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { name: { type: "string" }, tags: { type: "array" }, "a.b": {}, $x: {} },
  required: ["name"],
  additionalProperties: false,
};
const sch = { title: "People", jsonSchema };

async function rejects(p: Promise<unknown>, status: number, re?: RegExp) {
  await assert.rejects(p, (e: any) => e instanceof DatasetError && e.status === status && (!re || re.test(e.message)));
}

test("putSchema creates v1, increments, stores jsonSchemaJson string", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  const a = await svc.putSchema("u1", "people", sch);
  assert.equal(a.version, 1);
  const b = await svc.putSchema("u1", "people", { ...sch, description: "d" });
  assert.equal(b.version, 2);
  assert.equal(b.createdAt, a.createdAt);
  assert.equal(typeof root.appData.u1.schemas.people.jsonSchemaJson, "string");
  assert.equal(root.appData.u1.schemas.people.jsonSchema, undefined);
  assert.deepEqual((await svc.getSchema("u1", "people")).jsonSchema, jsonSchema);
  assert.equal((await svc.listSchemas("u1")).length, 3); // 2 built-ins + people
});

test("putSchema rejects bad id, bad input, oversize, uncompilable, remote ref", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await rejects(svc.putSchema("u1", "Bad.Id", sch), 400);
  await rejects(svc.putSchema("u1", "ok", { title: "" , jsonSchema }), 400);
  await rejects(svc.putSchema("u1", "ok", { title: "t", jsonSchema: { type: "object", description: "x".repeat(DATA_LIMITS.schemaBytesMax) } }), 400, /bytes/);
  await rejects(svc.putSchema("u1", "ok", { title: "t", jsonSchema: { type: "nonsense" } }), 400);
  await rejects(svc.putSchema("u1", "ok", { title: "t", jsonSchema: { $ref: "https://example.com/s.json" } }), 400);
  await rejects(svc.putSchema("u1", "ok", { title: "t", jsonSchema: { $ref: "#/$defs/missing" } }), 400);
});

test("schema cap of 20 per user", async () => {
  const svc = createDatasetService(makeDeps().deps);
  for (let i = 0; i < DATA_LIMITS.schemasPerUserMax; i++) await svc.putSchema("u1", `s${i}`, sch);
  await rejects(svc.putSchema("u1", "extra", sch), 409);
  await svc.putSchema("u1", "s0", sch); // update still allowed
  await svc.putSchema("u2", "extra", sch); // other user unaffected
});

test("putRecords validates, round-trips, preserves createdAt", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  await svc.putSchema("u1", "people", sch);
  const data = { name: "A", tags: [], "a.b": null, $x: { "k.l": [] } };
  const r1 = await svc.putRecords("u1", "people", { records: [{ id: "r1", data, emailIds: ["e1"] }, { id: "r2", data: { name: "B" } }] });
  assert.deepEqual(r1, { created: 2, updated: 0, ids: ["r1", "r2"] });
  assert.equal(typeof root.appData.u1.records.people.r1.dataJson, "string");
  const got = await svc.getRecord("u1", "people", "r1");
  assert.deepEqual(got.data, data);
  assert.equal(got.schemaVersion, 1);
  const r2 = await svc.putRecords("u1", "people", { records: [{ id: "r1", data: { name: "A2" } }] });
  assert.deepEqual(r2, { created: 0, updated: 1, ids: ["r1"] });
  const upd = await svc.getRecord("u1", "people", "r1");
  assert.equal(upd.createdAt, got.createdAt);
  assert.notEqual(upd.updatedAt, got.updatedAt);
  assert.deepEqual(upd.emailIds, []);
});

test("putRecords: unknown schema 404, all-or-nothing 400 naming index and id", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await rejects(svc.putRecords("u1", "nope", { records: [{ id: "a", data: {} }] }), 404);
  await svc.putSchema("u1", "people", sch);
  await rejects(
    svc.putRecords("u1", "people", { records: [{ id: "good", data: { name: "x" } }, { id: "bad", data: { name: 5 } }] }),
    400,
    /Record 1 \(bad\).*\/name/,
  );
  assert.equal((await svc.listRecords("u1", "people")).total, 0);
});

test("putRecords rejects oversize record and enforces dataset cap", async () => {
  const { deps } = makeDeps();
  const svc = createDatasetService(deps);
  await svc.putSchema("u1", "people", { title: "t", jsonSchema: { type: "object" } });
  await rejects(svc.putRecords("u1", "people", { records: [{ id: "big", data: { s: "x".repeat(DATA_LIMITS.recordBytesMax) } }] }), 400, /bytes/);
  const filler: Record<string, any> = {};
  for (let i = 0; i < DATA_LIMITS.recordsPerDatasetMax; i++) filler[`k${i}`] = { id: `k${i}`, dataJson: "{}", emailIds: [], createdAt: "t", updatedAt: "t" };
  await deps.set("appData/u1/records/people", filler);
  await rejects(svc.putRecords("u1", "people", { records: [{ id: "new", data: {} }] }), 409);
  await svc.putRecords("u1", "people", { records: [{ id: "k1", data: {} }] }); // update ok
});

test("schema version bump recompiles; old records keep stamp", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: { type: "string" } });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: "x" }] });
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: { type: "number" } });
  await rejects(svc.putRecords("u1", "s", { records: [{ id: "b", data: "x" }] }), 400);
  await svc.putRecords("u1", "s", { records: [{ id: "b", data: 1 }] });
  assert.equal((await svc.getRecord("u1", "s", "a")).schemaVersion, 1);
  assert.equal((await svc.getRecord("u1", "s", "b")).schemaVersion, 2);
});

test("listRecords sorts desc, filters by emailId, paginates", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: {} });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1, emailIds: ["e1"] }] });
  await svc.putRecords("u1", "s", { records: [{ id: "b", data: 2 }] });
  await svc.putRecords("u1", "s", { records: [{ id: "c", data: 3, emailIds: ["e1"] }] });
  const all = await svc.listRecords("u1", "s");
  assert.deepEqual(all.records.map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual(all.records[1].emailIds, []);
  const f = await svc.listRecords("u1", "s", { emailId: "e1" });
  assert.deepEqual(f.records.map((r) => r.id), ["c", "a"]);
  const p = await svc.listRecords("u1", "s", { limit: 1, offset: 1 });
  assert.equal(p.total, 3);
  assert.deepEqual(p.records.map((r) => r.id), ["b"]);
});

test("deleteRecord and deleteSchema", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  await rejects(svc.deleteSchema("u1", "s"), 404);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: {} });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1 }, { id: "b", data: 2 }] });
  await svc.deleteRecord("u1", "s", "a");
  await rejects(svc.getRecord("u1", "s", "a"), 404);
  await rejects(svc.deleteRecord("u1", "s", "a"), 404);
  await svc.deleteSchema("u1", "s");
  assert.equal(root.appData.u1.records.s, undefined);
  await rejects(svc.getSchema("u1", "s"), 404);
  // recreating starts at version 1 with a fresh validator
  const again = await svc.putSchema("u1", "s", { title: "t", jsonSchema: { type: "string" } });
  assert.equal(again.version, 1);
  await rejects(svc.putRecords("u1", "s", { records: [{ id: "z", data: 5 }] }), 400);
});

test("users are isolated", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: {} });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1 }] });
  await rejects(svc.getSchema("u2", "s"), 404);
  await rejects(svc.listRecords("u2", "s"), 404);
  await rejects(svc.getRecord("u2", "s", "a"), 404);
  await rejects(svc.putRecords("u2", "s", { records: [{ id: "a", data: 1 }] }), 404);
  assert.deepEqual((await svc.listSchemas("u2")).map((x) => x.id), [PERSON_DAY_SCHEMA_ID, PERSON_WEEK_SCHEMA_ID]);
  assert.equal(root.users, undefined);
});

test("record personIds: round-trip, dedupe, legacy default, replace", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: {} });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1, personIds: ["p1", "p2", "p1"] }, { id: "b", data: 2 }] });
  assert.deepEqual((await svc.getRecord("u1", "s", "a")).personIds, ["p1", "p2"]);
  assert.deepEqual((await svc.getRecord("u1", "s", "b")).personIds, []);
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1, personIds: ["p3"] }] });
  assert.deepEqual((await svc.getRecord("u1", "s", "a")).personIds, ["p3"]);
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1 }] });
  assert.deepEqual((await svc.getRecord("u1", "s", "a")).personIds, []);
  root.appData.u1.records.s.legacy = { id: "legacy", schemaId: "s", schemaVersion: 1, dataJson: "1", createdAt: "t", updatedAt: "t" };
  assert.deepEqual((await svc.getRecord("u1", "s", "legacy")).personIds, []);
});

test("listRecords filters by personId with correct total, paging and emailId AND", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await svc.putSchema("u1", "s", { title: "t", jsonSchema: {} });
  await svc.putRecords("u1", "s", { records: [{ id: "a", data: 1, personIds: ["p1"], emailIds: ["e1"] }] });
  await svc.putRecords("u1", "s", { records: [{ id: "b", data: 2, personIds: ["p2"] }] });
  await svc.putRecords("u1", "s", { records: [{ id: "c", data: 3, personIds: ["p1", "p2"], emailIds: ["e1"] }] });
  await svc.putRecords("u1", "s", { records: [{ id: "d", data: 4, personIds: ["p1"] }] });
  const p1 = await svc.listRecords("u1", "s", { personId: "p1" });
  assert.equal(p1.total, 3);
  assert.deepEqual(p1.records.map((r) => r.id), ["d", "c", "a"]);
  const paged = await svc.listRecords("u1", "s", { personId: "p1", limit: 1, offset: 1 });
  assert.equal(paged.total, 3);
  assert.deepEqual(paged.records.map((r) => r.id), ["c"]);
  const p2 = await svc.listRecords("u1", "s", { personId: "p2" });
  assert.deepEqual(p2.records.map((r) => r.id), ["c", "b"]);
  const both = await svc.listRecords("u1", "s", { personId: "p1", emailId: "e1" });
  assert.deepEqual(both.records.map((r) => r.id), ["c", "a"]);
  assert.equal((await svc.listRecords("u1", "s", { personId: "nobody" })).total, 0);
});

const toddlerDay = {
  date: "2026-10-09",
  title: "Families theme; napped 1:07-2:20pm",
  source: "6 Owls (Bridge)",
  metrics: [{ label: "In", value: "9:37" }, { label: "Out", value: "4:21" }, { label: "Nap", value: "1h 13m" }, { label: "Diapers", value: "3" }],
  tags: [{ label: "Math Concepts", group: "Lessons" }],
  highlights: [{ title: "Centers", text: "Colored water on paper towels." }],
  timeline: {
    start: "09:37",
    end: "16:21",
    spans: [{ start: "13:07", end: "14:20", label: "Nap" }],
    events: [{ time: "10:46", kind: "dry", label: "Dry" }, { time: "15:00", kind: "bm", label: "BM" }],
  },
};
const olderDay = {
  date: "2026-10-09",
  title: "Science test went well",
  source: "Lincoln Middle School",
  metrics: [{ label: "Homework due", value: "2", tone: "warn" }, { label: "Math", value: "A-", tone: "good" }],
  tags: [{ label: "Fractions", group: "Math" }],
  highlights: [{ text: "Field trip form due Friday." }],
};

test("built-in person schemas are listed first for a fresh user without RTDB writes", async () => {
  const { deps, root } = makeDeps();
  const svc = createDatasetService(deps);
  await svc.putSchema("u1", "aaa", sch);
  const list = await svc.listSchemas("u1");
  assert.deepEqual(list.map((s) => s.id), [PERSON_DAY_SCHEMA_ID, PERSON_WEEK_SCHEMA_ID, "aaa"]);
  assert.equal(list[0].version, 1);
  assert.equal((await svc.getSchema("u2", PERSON_WEEK_SCHEMA_ID)).version, 1);
  assert.deepEqual((await svc.listSchemas("u2")).map((s) => s.id), [PERSON_DAY_SCHEMA_ID, PERSON_WEEK_SCHEMA_ID]);
  assert.equal(root.appData.u1.schemas[PERSON_DAY_SCHEMA_ID], undefined);
});

test("ff-person-day accepts toddler and older-child records; personId filter works", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await svc.putRecords("u1", PERSON_DAY_SCHEMA_ID, {
    records: [
      { id: "p1-2026-10-09", data: toddlerDay, personIds: ["p1"] },
      { id: "p2-2026-10-09", data: olderDay, personIds: ["p2"] },
    ],
  });
  const got = await svc.getRecord("u1", PERSON_DAY_SCHEMA_ID, "p1-2026-10-09");
  assert.equal(got.schemaVersion, 1);
  assert.deepEqual(got.data, toddlerDay);
  const p2 = await svc.listRecords("u1", PERSON_DAY_SCHEMA_ID, { personId: "p2" });
  assert.deepEqual(p2.records.map((r) => r.id), ["p2-2026-10-09"]);
  await svc.deleteRecord("u1", PERSON_DAY_SCHEMA_ID, "p2-2026-10-09");
  assert.equal((await svc.listRecords("u1", PERSON_DAY_SCHEMA_ID)).total, 1);
  await svc.putRecords("u1", PERSON_WEEK_SCHEMA_ID, {
    records: [{ id: "p1-2026-10-05", data: { weekStart: "2026-10-05", title: "Good week", highlights: [{ date: "2026-10-06", text: "Walked" }] } }],
  });
});

test("ff-person-day rejects missing date, bad time, unknown property", async () => {
  const svc = createDatasetService(makeDeps().deps);
  const put = (data: any) => svc.putRecords("u1", PERSON_DAY_SCHEMA_ID, { records: [{ id: "x", data }] });
  const { date: _d, ...noDate } = olderDay;
  await rejects(put(noDate), 400, /date/);
  await rejects(put({ ...olderDay, timeline: { start: "9:37" } }), 400);
  await rejects(put({ ...olderDay, timeline: { start: "24:00" } }), 400);
  await rejects(put({ ...olderDay, extra: 1 }), 400);
  await rejects(put({ ...olderDay, metrics: [{ label: "a", value: "b", tone: "loud" }] }), 400);
});

test("reserved ff- prefix: put/delete rejected with 403, built-ins not counted in cap", async () => {
  const svc = createDatasetService(makeDeps().deps);
  await rejects(svc.putSchema("u1", PERSON_DAY_SCHEMA_ID, sch), 403, /ff-/);
  await rejects(svc.putSchema("u1", "ff-custom", sch), 403, /ff-/);
  await rejects(svc.deleteSchema("u1", PERSON_DAY_SCHEMA_ID), 403, /ff-/);
  await rejects(svc.deleteSchema("u1", "ff-custom"), 403, /ff-/);
  for (let i = 0; i < DATA_LIMITS.schemasPerUserMax; i++) await svc.putSchema("u1", `s${i}`, sch);
  await rejects(svc.putSchema("u1", "extra", sch), 409);
});
