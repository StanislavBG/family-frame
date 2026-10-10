import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildFamilyFrameMcpServer } from "./mcp";
import { CalendarError, type CalendarService } from "./calendar-service";
import type { MailService } from "./mail-service";
import type { MediaStore } from "./media-store";
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

test("lists the 24 tools", async () => {
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
      "mail_mark_read",
      "mail_rehost_images",
      "mail_upsert_emails",
      "media_delete",
      "media_get_meta",
      "media_import_url",
      "media_list",
      "media_upload",
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
