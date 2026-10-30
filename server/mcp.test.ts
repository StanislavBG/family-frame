import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildFamilyFrameMcpServer } from "./mcp";
import { CalendarError, type CalendarService } from "./calendar-service";
import type { MailService } from "./mail-service";
import type { MediaStore } from "./media-store";
import { createTimeSeriesService, type TimeSeriesDeps } from "./time-series-service";
import { DatasetError, type DatasetService } from "./dataset-service";

function makeFakeService() {
  const calls: { method: string; args: any[] }[] = [];
  const events: any[] = [
    { id: "e1", title: "Old", startDate: "2026-01-10", endDate: "2026-01-12", type: "Shared", people: [] },
    { id: "e2", title: "Later", startDate: "2026-03-01", endDate: "2026-03-01", type: "Private", people: [] },
  ];
  const service = {
    async listPeople() {
      return [
        { id: "p1", name: "Grandma" },
        { id: "p2", name: "Sam" },
      ];
    },
    async listEvents() {
      return events;
    },
    async createEvent(...args: any[]) {
      calls.push({ method: "createEvent", args });
      return { id: "new", ...args[2], creatorId: args[0] };
    },
    async updateEvent(...args: any[]) {
      calls.push({ method: "updateEvent", args });
      return { id: args[2], ...args[3] };
    },
    async deleteEvent(...args: any[]) {
      calls.push({ method: "deleteEvent", args });
      if (args[2] === "missing") throw new CalendarError("You can only delete your own events", 403);
    },
  } as unknown as CalendarService;
  return { service, calls };
}

function makeFakeMail() {
  const calls: { method: string; args: any[] }[] = [];
  const mail = {
    async upsertEmails(...args: any[]) {
      calls.push({ method: "upsertEmails", args });
      return { created: 1, updated: 0, ids: ["m1"], pruned: 0 };
    },
    async listEmails(...args: any[]) {
      calls.push({ method: "listEmails", args });
      return { emails: [], nextBefore: null };
    },
    async listKinds(...args: any[]) {
      calls.push({ method: "listKinds", args });
      return { kinds: [{ kind: "school", count: 3, unread: 1, tone: "sun" }] };
    },
    async getEmail() {
      return null;
    },
    async setRead(...args: any[]) {
      calls.push({ method: "setRead", args });
      return { updated: 0 };
    },
    async deleteEmail() {
      return false;
    },
    async unreadCount() {
      return 0;
    },
  } as unknown as MailService;
  return { mail, calls };
}

function makeFakeData() {
  const calls: { method: string; args: any[] }[] = [];
  const data = {
    async putSchema(...args: any[]) {
      calls.push({ method: "putSchema", args });
      return { id: args[1], version: 1, ...args[2] };
    },
    async listSchemas(...args: any[]) {
      calls.push({ method: "listSchemas", args });
      return [];
    },
    async getSchema(...args: any[]) {
      calls.push({ method: "getSchema", args });
      throw new DatasetError("Schema not found", 404);
    },
    async deleteSchema(...args: any[]) {
      calls.push({ method: "deleteSchema", args });
    },
    async putRecords(...args: any[]) {
      calls.push({ method: "putRecords", args });
      return { created: args[2].records.length, updated: 0, ids: args[2].records.map((r: any) => r.id) };
    },
    async listRecords(...args: any[]) {
      calls.push({ method: "listRecords", args });
      return { records: [], total: 0 };
    },
    async getRecord(...args: any[]) {
      calls.push({ method: "getRecord", args });
      throw new DatasetError("Record not found", 404);
    },
    async deleteRecord(...args: any[]) {
      calls.push({ method: "deleteRecord", args });
    },
  } as unknown as DatasetService;
  return { data, calls };
}

function makeFakeMedia() {
  const calls: { method: string; args: any[] }[] = [];
  const meta = {
    id: "abc",
    filename: "a b.png",
    mimeType: "image/png",
    kind: "image",
    size: 3,
    sha256: "x",
    tags: [],
    emailIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const media = {
    async putMedia(...args: any[]) {
      calls.push({ method: "putMedia", args });
      return { meta, created: true };
    },
    async listMedia(...args: any[]) {
      calls.push({ method: "listMedia", args });
      return { items: [meta], total: 1, usage: { bytes: 3, count: 1 } };
    },
    async getMedia(...args: any[]) {
      calls.push({ method: "getMedia", args });
      return null;
    },
    async deleteMedia(...args: any[]) {
      calls.push({ method: "deleteMedia", args });
      return true;
    },
  } as unknown as MediaStore;
  return { media, calls };
}

async function connect(
  scopes: string[],
  service: CalendarService,
  mail?: MailService,
  data?: DatasetService,
  media?: MediaStore,
  extra: Record<string, unknown> = {},
) {
  const server = buildFamilyFrameMcpServer({ userId: "u1", username: "user", scopes }, service, {
    ...(mail ? { mail } : {}),
    ...(data ? { data } : {}),
    ...(media ? { media } : {}),
    ...extra,
  });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

const text = (r: any) => (r.content as any[])[0].text as string;
const RW = ["calendar:read", "calendar:write"];

test("lists the 32 tools", async () => {
  const { service } = makeFakeService();
  const client = await connect(RW, service);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "create_event",
      "data_delete_record",
      "data_delete_schema",
      "data_get_record",
      "data_get_schema",
      "data_list_records",
      "data_list_schemas",
      "data_put_records",
      "data_put_schema",
      "delete_event",
      "list_events",
      "list_people",
      "mail_delete_email",
      "mail_get_email",
      "mail_list_emails",
      "mail_list_kinds",
      "mail_mark_read",
      "mail_rehost_images",
      "mail_upsert_emails",
      "media_delete",
      "media_get_meta",
      "media_import_url",
      "media_list",
      "media_upload",
      "metrics_add_points",
      "metrics_delete_point",
      "metrics_delete_series",
      "metrics_get_series",
      "metrics_list_series",
      "metrics_list_tags",
      "metrics_put_series",
      "person_view_validate",
      "update_event",
    ],
  );
});

test("create_event resolves person by name and defaults endDate/type", async () => {
  const { service, calls } = makeFakeService();
  const client = await connect(RW, service);
  const r = await client.callTool({
    name: "create_event",
    arguments: { title: "Dinner", startDate: "2026-02-02", people: ["grandma", "p2"] },
  });
  assert.ok(!r.isError);
  assert.deepEqual(calls[0].args[2], {
    title: "Dinner",
    startDate: "2026-02-02",
    endDate: "2026-02-02",
    type: "Private",
    people: ["p1", "p2"],
  });
  assert.equal(JSON.parse(text(r)).id, "new");
});

test("unknown person name is an error result", async () => {
  const { service, calls } = makeFakeService();
  const client = await connect(RW, service);
  const r = await client.callTool({
    name: "create_event",
    arguments: { title: "X", startDate: "2026-02-02", people: ["Nobody"] },
  });
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
});

test("read-only scopes cannot create", async () => {
  const { service, calls } = makeFakeService();
  const client = await connect(["calendar:read"], service);
  const r = await client.callTool({ name: "create_event", arguments: { title: "X", startDate: "2026-02-02" } });
  assert.equal(r.isError, true);
  assert.match(text(r), /calendar:write/);
  assert.equal(calls.length, 0);
});

test("list_events filters by overlap", async () => {
  const { service } = makeFakeService();
  const client = await connect(["calendar:read"], service);
  const r = await client.callTool({ name: "list_events", arguments: { from: "2026-01-12", to: "2026-02-01" } });
  assert.deepEqual(JSON.parse(text(r)).map((e: any) => e.id), ["e1"]);
});

test("update_event merges onto existing event", async () => {
  const { service, calls } = makeFakeService();
  const client = await connect(RW, service);
  await client.callTool({ name: "update_event", arguments: { eventId: "e1", title: "Renamed" } });
  assert.deepEqual(calls[0].args[3], {
    title: "Renamed",
    startDate: "2026-01-10",
    endDate: "2026-01-12",
    type: "Shared",
    people: [],
  });
});

test("delete_event calls service.deleteEvent; CalendarError becomes isError", async () => {
  const { service, calls } = makeFakeService();
  const client = await connect(RW, service);
  const ok = await client.callTool({ name: "delete_event", arguments: { eventId: "e1" } });
  assert.ok(!ok.isError);
  assert.equal(calls[0].method, "deleteEvent");
  assert.equal(calls[0].args[2], "e1");
  const bad = await client.callTool({ name: "delete_event", arguments: { eventId: "missing" } });
  assert.equal(bad.isError, true);
  assert.match(text(bad), /only delete your own/);
});

const sampleEmail = {
  id: "m1",
  receivedAt: "2026-01-01T00:00:00Z",
  from: { email: "a@example.com" },
  subject: "Hi",
  text: "Hello",
};

test("calendar-only token is denied mail_upsert_emails", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(RW, service, mail);
  const r = await client.callTool({ name: "mail_upsert_emails", arguments: { emails: [sampleEmail] } });
  assert.equal(r.isError, true);
  assert.match(text(r), /mail:write/);
  assert.equal(calls.length, 0);
});

test("mail:read token can list but not mark read", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:read"], service, mail);
  const list = await client.callTool({ name: "mail_list_emails", arguments: { limit: 5 } });
  assert.ok(!list.isError);
  assert.equal(calls[0].method, "listEmails");
  const mark = await client.callTool({ name: "mail_mark_read", arguments: { ids: "all" } });
  assert.equal(mark.isError, true);
  assert.match(text(mark), /mail:write/);
  assert.equal(calls.length, 1);
});

test("mail:write token upserts emails", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:write"], service, mail);
  const r = await client.callTool({ name: "mail_upsert_emails", arguments: { emails: [sampleEmail] } });
  assert.ok(!r.isError);
  assert.equal(calls[0].method, "upsertEmails");
  assert.equal(calls[0].args[0], "u1");
  assert.equal(JSON.parse(text(r)).created, 1);
});

const sampleRecord = { id: "r1", data: { a: 1 }, emailIds: ["m1"] };

test("mail-only token is denied data_put_records", async () => {
  const { service } = makeFakeService();
  const { data, calls } = makeFakeData();
  const client = await connect(["mail:write"], service, undefined, data);
  const r = await client.callTool({ name: "data_put_records", arguments: { schemaId: "s1", records: [sampleRecord] } });
  assert.equal(r.isError, true);
  assert.match(text(r), /data:write/);
  assert.equal(calls.length, 0);
});

test("data_list_records passes sortField and sortDir; bad sortField is refused", async () => {
  const { service } = makeFakeService();
  const { data, calls } = makeFakeData();
  const client = await connect(["data:read"], service, undefined, data);
  const ok = await client.callTool({ name: "data_list_records", arguments: { schemaId: "s1", sortField: "stats.wait", sortDir: "asc" } });
  assert.ok(!ok.isError);
  assert.equal(calls[0].args[2].sortField, "stats.wait");
  assert.equal(calls[0].args[2].sortDir, "asc");
  const bad = await client.callTool({ name: "data_list_records", arguments: { schemaId: "s1", sortField: "a b" } }).then((r) => r, () => ({ isError: true }));
  assert.equal(bad.isError, true);
  assert.equal(calls.length, 1);
});

test("data:read token can list records but not put schemas; DatasetError is isError", async () => {
  const { service } = makeFakeService();
  const { data, calls } = makeFakeData();
  const client = await connect(["data:read"], service, undefined, data);
  const list = await client.callTool({ name: "data_list_records", arguments: { schemaId: "s1", limit: 5 } });
  assert.ok(!list.isError);
  assert.equal(calls[0].method, "listRecords");
  assert.deepEqual(calls[0].args.slice(0, 2), ["u1", "s1"]);
  const put = await client.callTool({
    name: "data_put_schema",
    arguments: { schemaId: "s1", title: "S", jsonSchema: { type: "object" } },
  });
  assert.equal(put.isError, true);
  assert.match(text(put), /data:write/);
  const get = await client.callTool({ name: "data_get_schema", arguments: { schemaId: "s1" } });
  assert.equal(get.isError, true);
  assert.match(text(get), /not found/);
  assert.equal(calls.length, 2);
});

test("data:write token puts a schema then records", async () => {
  const { service } = makeFakeService();
  const { data, calls } = makeFakeData();
  const client = await connect(["data:write"], service, undefined, data);
  const s = await client.callTool({
    name: "data_put_schema",
    arguments: { schemaId: "s1", title: "S", jsonSchema: { type: "object" } },
  });
  assert.ok(!s.isError);
  assert.equal(calls[0].method, "putSchema");
  assert.deepEqual(calls[0].args[2], { title: "S", jsonSchema: { type: "object" } });
  const r = await client.callTool({ name: "data_put_records", arguments: { schemaId: "s1", records: [sampleRecord] } });
  assert.ok(!r.isError);
  assert.equal(calls[1].method, "putRecords");
  assert.deepEqual(calls[1].args[2], { records: [sampleRecord] });
  assert.equal(JSON.parse(text(r)).created, 1);
});

const uploadArgs = { filename: "a b.png", mimeType: "image/png", base64: "AAEC" };

test("data-only token is denied media_upload", async () => {
  const { service } = makeFakeService();
  const { media, calls } = makeFakeMedia();
  const client = await connect(["data:write"], service, undefined, undefined, media);
  const r = await client.callTool({ name: "media_upload", arguments: uploadArgs });
  assert.equal(r.isError, true);
  assert.match(text(r), /media:write/);
  assert.equal(calls.length, 0);
});

test("media:read token can list and get_meta but not delete", async () => {
  const { service } = makeFakeService();
  const { media, calls } = makeFakeMedia();
  const client = await connect(["media:read"], service, undefined, undefined, media);
  const list = await client.callTool({ name: "media_list", arguments: { kind: "image" } });
  assert.ok(!list.isError);
  const body = JSON.parse(text(list));
  assert.equal(body.items[0].url, "/api/files/abc");
  assert.equal(calls[0].method, "listMedia");
  const meta = await client.callTool({ name: "media_get_meta", arguments: { id: "abc" } });
  assert.equal(meta.isError, true);
  assert.match(text(meta), /not found/);
  const del = await client.callTool({ name: "media_delete", arguments: { id: "abc" } });
  assert.equal(del.isError, true);
  assert.match(text(del), /media:write/);
  assert.equal(calls.length, 2);
});

test("media:write token uploads decoded bytes and rejects bad base64", async () => {
  const { service } = makeFakeService();
  const { media, calls } = makeFakeMedia();
  const client = await connect(["media:write"], service, undefined, undefined, media);
  const r = await client.callTool({ name: "media_upload", arguments: { ...uploadArgs, tags: ["t"] } });
  assert.ok(!r.isError);
  assert.equal(calls[0].method, "putMedia");
  assert.deepEqual([...calls[0].args[1].buffer], [0, 1, 2]);
  assert.equal(calls[0].args[1].base64, undefined);
  const out = JSON.parse(text(r));
  assert.equal(out.created, true);
  assert.equal(out.meta.url, "/api/files/abc");
  const bad = await client.callTool({ name: "media_upload", arguments: { ...uploadArgs, base64: "not base64!" } });
  assert.equal(bad.isError, true);
  assert.equal(calls.length, 1);
  const del = await client.callTool({ name: "media_delete", arguments: { id: "abc" } });
  assert.ok(!del.isError);
  assert.equal(calls[1].method, "deleteMedia");
});

test("media_import_url imports via the importer and returns meta with url", async () => {
  const { service } = makeFakeService();
  const calls: any[][] = [];
  const importer = {
    async importFromUrl(...args: any[]) {
      calls.push(args);
      return { meta: { id: "u 1", filename: "p.png" }, created: true, fetched: true };
    },
  };
  const client = await connect(["media:write"], service, undefined, undefined, undefined, { importer });
  const r = await client.callTool({ name: "media_import_url", arguments: { url: "https://x.test/p.png", tags: ["t"] } });
  assert.ok(!r.isError);
  const out = JSON.parse(text(r));
  assert.equal(out.created, true);
  assert.equal(out.meta.url, "/api/files/u%201");
  assert.equal(calls[0][0], "u1");
  assert.equal(calls[0][1].url, "https://x.test/p.png");
  const denied = await (await connect(["media:read"], service, undefined, undefined, undefined, { importer })).callTool({
    name: "media_import_url",
    arguments: { url: "https://x.test/p.png" },
  });
  assert.equal(denied.isError, true);
  assert.equal(calls.length, 1);
});

test("mail_rehost_images needs both mail:write and media:write", async () => {
  const { service } = makeFakeService();
  const calls: any[][] = [];
  const result = { processed: 2, imported: 3, failed: [], remaining: 0 };
  const rehoster = {
    async rehostEmailImages(...args: any[]) {
      calls.push(args);
      return result;
    },
  };
  const denied = await (await connect(["mail:write"], service, undefined, undefined, undefined, { rehoster })).callTool({
    name: "mail_rehost_images",
    arguments: {},
  });
  assert.equal(denied.isError, true);
  assert.match(text(denied), /media:write/);
  assert.equal(calls.length, 0);
  const client = await connect(["mail:write", "media:write"], service, undefined, undefined, undefined, { rehoster });
  const r = await client.callTool({ name: "mail_rehost_images", arguments: { limit: 5 } });
  assert.ok(!r.isError);
  assert.deepEqual(JSON.parse(text(r)), result);
  assert.deepEqual(calls[0], ["u1", { limit: 5 }]);
});

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const email = (personIds: string[]) => ({
  id: "m1",
  receivedAt: "2026-01-01T00:00:00.000Z",
  from: { email: "a@b.c" },
  text: "hi",
  subject: "s",
  personIds,
});

test("mail_upsert_emails resolves person names, keeps ids and uuid-shaped unknowns", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:write"], service, mail);
  const r = await client.callTool({
    name: "mail_upsert_emails",
    arguments: { emails: [email(["grandma", "p2", UUID])] },
  });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(calls[0].args[1].emails[0].personIds, ["p1", "p2", UUID]);
});

test("mail_list_emails resolves personId by name", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:read"], service, mail);
  const r = await client.callTool({ name: "mail_list_emails", arguments: { personId: "SAM" } });
  assert.ok(!r.isError, text(r));
  assert.equal(calls[0].args[1].personId, "p2");
});

test("mail_list_kinds resolves personId by name and returns counts per kind", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:read"], service, mail);
  const r = await client.callTool({ name: "mail_list_kinds", arguments: { personId: "SAM", label: "school" } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)), { kinds: [{ kind: "school", count: 3, unread: 1, tone: "sun" }] });
  assert.equal(calls[0].method, "listKinds");
  assert.equal(calls[0].args[1].personId, "p2");
  assert.equal(calls[0].args[1].label, "school");
});

test("mail_list_kinds without mail scopes errors", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["data:read"], service, mail);
  const r = await client.callTool({ name: "mail_list_kinds", arguments: {} });
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
});

test("unknown person name errors on upsert and list", async () => {
  const { service } = makeFakeService();
  const { mail, calls } = makeFakeMail();
  const client = await connect(["mail:read", "mail:write"], service, mail);
  const w = await client.callTool({ name: "mail_upsert_emails", arguments: { emails: [email(["Nobody"])] } });
  assert.equal(w.isError, true);
  assert.match(text(w), /Unknown person "Nobody"/);
  const l = await client.callTool({ name: "mail_list_emails", arguments: { personId: "Nobody" } });
  assert.equal(l.isError, true);
  assert.equal(calls.length, 0);
});

test("media_list, media_upload and media_import_url resolve person refs", async () => {
  const { service } = makeFakeService();
  const { media, calls } = makeFakeMedia();
  const importer = {
    async importFromUrl(...args: any[]) {
      calls.push({ method: "importFromUrl", args });
      return { meta: { id: "abc" }, created: true };
    },
  };
  const client = await connect(["media:read", "media:write"], service, undefined, undefined, media, { importer });
  assert.ok(!(await client.callTool({ name: "media_list", arguments: { personId: "grandma" } })).isError);
  assert.equal(calls.find((c) => c.method === "listMedia")!.args[1].personId, "p1");
  const up = await client.callTool({
    name: "media_upload",
    arguments: { filename: "a.png", mimeType: "image/png", base64: "AAAA", personIds: ["Sam"] },
  });
  assert.ok(!up.isError, text(up));
  assert.deepEqual(calls.find((c) => c.method === "putMedia")!.args[1].personIds, ["p2"]);
  const imp = await client.callTool({
    name: "media_import_url",
    arguments: { url: "https://example.com/a.png", personIds: ["grandma", UUID] },
  });
  assert.ok(!imp.isError, text(imp));
  assert.deepEqual(calls.find((c) => c.method === "importFromUrl")!.args[1].personIds, ["p1", UUID]);
  const bad = await client.callTool({ name: "media_list", arguments: { personId: "Nobody" } });
  assert.equal(bad.isError, true);
});

test("data_put_records into ff-person-day resolves personIds; data_list_records filters by personId", async () => {
  const { service } = makeFakeService();
  const { data, calls } = makeFakeData();
  const client = await connect(["data:read", "data:write"], service, undefined, data);
  const put = await client.callTool({
    name: "data_put_records",
    arguments: { schemaId: "ff-person-day", records: [{ id: "2026-01-01", data: {}, personIds: ["Sam"] }] },
  });
  assert.ok(!put.isError, text(put));
  assert.deepEqual(calls.find((c) => c.method === "putRecords")!.args[2].records[0].personIds, ["p2"]);
  const list = await client.callTool({
    name: "data_list_records",
    arguments: { schemaId: "ff-person-day", personId: "grandma" },
  });
  assert.ok(!list.isError, text(list));
  assert.equal(calls.find((c) => c.method === "listRecords")!.args[2].personId, "p1");
  const bad = await client.callTool({
    name: "data_put_records",
    arguments: { schemaId: "ff-person-day", records: [{ id: "x", data: {}, personIds: ["Nobody"] }] },
  });
  assert.equal(bad.isError, true);
});

function makeMemoryTimeSeries() {
  const root: Record<string, any> = {};
  const parts = (path: string) => path.split("/").filter(Boolean);
  const read = (path: string) => parts(path).reduce<any>((n, k) => (n == null ? undefined : n[k]), root);
  const parent = (path: string) => {
    const ks = parts(path);
    const last = ks.pop() as string;
    const node = ks.reduce<any>((n, k) => (n[k] ??= {}), root);
    return { node, last };
  };
  const deps: TimeSeriesDeps = {
    async get(path) {
      const v = read(path);
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    },
    async set(path, value) {
      const { node, last } = parent(path);
      node[last] = JSON.parse(JSON.stringify(value));
    },
    async update(path, values) {
      for (const [k, v] of Object.entries(values)) {
        const { node, last } = parent(`${path}/${k}`);
        if (v === null) delete node[last];
        else node[last] = JSON.parse(JSON.stringify(v));
      }
    },
    async remove(path) {
      const { node, last } = parent(path);
      delete node[last];
    },
  };
  return createTimeSeriesService(deps);
}

test("data:read token is denied metrics_put_series", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, undefined, undefined, { timeSeries: makeMemoryTimeSeries() });
  const put = await client.callTool({ name: "metrics_put_series", arguments: { seriesId: "power", title: "Power" } });
  assert.equal(put.isError, true);
  assert.match(text(put), /metrics:write/);
  const list = await client.callTool({ name: "metrics_list_series", arguments: {} });
  assert.equal(list.isError, true);
});

test("metrics:write token puts a series, adds points and gets it back", async () => {
  const { service } = makeFakeService();
  const client = await connect(["metrics:write"], service, undefined, undefined, undefined, { timeSeries: makeMemoryTimeSeries() });
  const put = await client.callTool({
    name: "metrics_put_series",
    arguments: { seriesId: "power", title: "Power", tags: ["utilities"], unit: "USD", annotations: { vendor: "PG&E" } },
  });
  assert.ok(!put.isError, text(put));
  const add = await client.callTool({
    name: "metrics_add_points",
    arguments: { seriesId: "power", points: [{ t: "2026-02-01", value: 90 }, { t: "2026-01-01", value: 80.5, label: "Jan" }] },
  });
  assert.ok(!add.isError, text(add));
  assert.equal(JSON.parse(text(add)).upserted, 2);
  const got = await client.callTool({ name: "metrics_get_series", arguments: { seriesId: "power" } });
  assert.ok(!got.isError, text(got));
  const body = JSON.parse(text(got));
  assert.equal(body.series.title, "Power");
  assert.deepEqual(body.series.annotations, { vendor: "PG&E" });
  assert.deepEqual(body.points.map((p: any) => p.t), ["2026-01-01", "2026-02-01"]);
  const bad = await client.callTool({ name: "metrics_add_points", arguments: { seriesId: "nope", points: [{ t: "2026-01-01", value: 1 }] } });
  assert.equal(bad.isError, true);
  const del = await client.callTool({ name: "metrics_delete_point", arguments: { seriesId: "power", t: "2026-01-01" } });
  assert.ok(!del.isError, text(del));
  const delSeries = await client.callTool({ name: "metrics_delete_series", arguments: { seriesId: "power" } });
  assert.ok(!delSeries.isError, text(delSeries));
});

test("metrics_list_series filters by tag", async () => {
  const { service } = makeFakeService();
  const client = await connect(["metrics:write"], service, undefined, undefined, undefined, { timeSeries: makeMemoryTimeSeries() });
  await client.callTool({ name: "metrics_put_series", arguments: { seriesId: "power", title: "Power", tags: ["utilities"] } });
  await client.callTool({ name: "metrics_put_series", arguments: { seriesId: "steps", title: "Steps", tags: ["health"] } });
  const all = JSON.parse(text(await client.callTool({ name: "metrics_list_series", arguments: {} })));
  assert.equal(all.length, 2);
  const util = JSON.parse(text(await client.callTool({ name: "metrics_list_series", arguments: { tag: "utilities" } })));
  assert.deepEqual(util.map((s: any) => s.id), ["power"]);
  const tags = JSON.parse(text(await client.callTool({ name: "metrics_list_tags", arguments: {} })));
  assert.equal(tags.length, 2);
});

const validView = {
  title: "Piano",
  blocks: [
    { type: "metrics", source: { schemaId: "practice" }, fields: [{ field: "minutes", label: "Minutes" }, { field: "stats.streak", label: "Streak" }] },
    { type: "chart", source: { seriesId: "no-such-series" } },
    { type: "text", text: "Hello" },
  ],
};

function makeViewData() {
  const { data } = makeFakeData();
  (data as any).listRecords = async (_u: string, _s: string, opts: any) => ({
    records: [{ id: "r1", data: { minutes: 20 }, personIds: ["p1"] }],
    total: 3,
    opts,
  });
  return data;
}

test("person_view_validate returns schema errors for an invalid view", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, makeViewData(), undefined, { timeSeries: makeMemoryTimeSeries() });
  const r = await client.callTool({ name: "person_view_validate", arguments: { view: { title: "x", blocks: [] }, person: "Grandma" } });
  assert.ok(!r.isError, text(r));
  const body = JSON.parse(text(r));
  assert.equal(body.valid, false);
  assert.ok(body.errors.length > 0);
  assert.equal(typeof body.errors[0].path, "string");
});

test("person_view_validate reports record counts and missing fields", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, makeViewData(), undefined, { timeSeries: makeMemoryTimeSeries() });
  const r = await client.callTool({ name: "person_view_validate", arguments: { view: validView, person: "Grandma" } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)), {
    valid: true,
    blocks: [
      { index: 0, type: "metrics", records: 3, missingFields: ["stats.streak"] },
      { index: 1, type: "chart", records: 0, missingFields: [] },
      { index: 2, type: "text", records: null, missingFields: [] },
    ],
  });
  const unknown = await client.callTool({ name: "person_view_validate", arguments: { view: validView, person: "Nobody" } });
  assert.equal(unknown.isError, true);
});

test("person_view_validate accepts icon mail", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, makeViewData(), undefined, { timeSeries: makeMemoryTimeSeries() });
  const r = await client.callTool({ name: "person_view_validate", arguments: { view: { title: "Email", icon: "mail", blocks: [{ type: "text", text: "Hello" }] }, person: "Grandma" } });
  assert.ok(!r.isError, text(r));
  assert.equal(JSON.parse(text(r)).valid, true);
});

test("person_view_validate lists a missing list urlField", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, makeViewData(), undefined, { timeSeries: makeMemoryTimeSeries() });
  const view = { title: "Waiting", blocks: [{ type: "list", source: { schemaId: "practice" }, titleField: "minutes", urlField: "thread.url" }] };
  const r = await client.callTool({ name: "person_view_validate", arguments: { view, person: "Grandma" } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)).blocks[0].missingFields, ["thread.url"]);
});

test("person_view_validate lists a missing list sortField", async () => {
  const { service } = makeFakeService();
  const client = await connect(["data:read"], service, undefined, makeViewData(), undefined, { timeSeries: makeMemoryTimeSeries() });
  const view = { title: "Waiting", blocks: [{ type: "list", source: { schemaId: "practice" }, titleField: "minutes", sortField: "waiting_days" }] };
  const r = await client.callTool({ name: "person_view_validate", arguments: { view, person: "Grandma" } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(JSON.parse(text(r)).blocks[0].missingFields, ["waiting_days"]);
});

test("person_view_validate is refused without data:read", async () => {
  const { service } = makeFakeService();
  const client = await connect(["mail:read"], service, undefined, makeViewData());
  const r = await client.callTool({ name: "person_view_validate", arguments: { view: validView, person: "Grandma" } });
  assert.equal(r.isError, true);
  assert.match(text(r), /data:read/);
});
