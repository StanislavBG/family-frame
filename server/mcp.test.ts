import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildFamilyFrameMcpServer } from "./mcp";
import { CalendarError, type CalendarService } from "./calendar-service";

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

async function connect(scopes: string[], service: CalendarService) {
  const server = buildFamilyFrameMcpServer({ userId: "u1", username: "user", scopes }, service);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

const text = (r: any) => (r.content as any[])[0].text as string;
const RW = ["calendar:read", "calendar:write"];

test("lists the 5 tools", async () => {
  const { service } = makeFakeService();
  const client = await connect(RW, service);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["create_event", "delete_event", "list_events", "list_people", "update_event"],
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
