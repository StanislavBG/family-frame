import { test } from "node:test";
import assert from "node:assert/strict";
import { createCalendarService, CalendarError } from "./calendar-service";

function makeService(seed: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(seed));
  const svc = createCalendarService({
    async getOrCreateUser(id, username) {
      if (!store.has(id)) {
        store.set(id, { clerkId: id, username, settings: {}, people: [], events: [], connections: [] });
      }
      return structuredClone(store.get(id));
    },
    async getUserData(id) {
      return store.has(id) ? structuredClone(store.get(id)) : null;
    },
    async updateUserData(id, updates) {
      store.set(id, { ...store.get(id), ...updates });
    },
  });
  return { svc, store };
}

const ev = (id: string, type: string, extra: any = {}) => ({
  id, title: `t-${id}`, startDate: "2026-01-01", endDate: "2026-01-02", type, people: [], creatorId: "u1", creatorName: "Me", ...extra,
});

const input = { title: "Dinner", startDate: "2026-03-01", endDate: "2026-03-01", type: "Shared" as const, people: [] };

async function rejects400(p: Promise<unknown>) {
  await assert.rejects(p, (e: any) => e instanceof CalendarError && e.status === 400);
}

test("list merges own and connected Shared events only", async () => {
  const { svc } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [], events: [ev("a", "Private")], connections: ["u2"] },
    u2: { clerkId: "u2", username: "them", settings: { homeName: "Their Home" }, events: [ev("b", "Shared", { creatorId: "u2" }), ev("c", "Private", { creatorId: "u2" })] },
  });
  const events = await svc.listEvents("u1", "me");
  assert.deepEqual(events.map((e) => e.id), ["a", "b"]);
});

test("create sets id and creator from homeName", async () => {
  const { svc, store } = makeService({
    u1: { clerkId: "u1", username: "me", settings: { homeName: "Home" }, people: [], events: [], connections: [] },
  });
  const created = await svc.createEvent("u1", "me", input);
  assert.ok(created.id);
  assert.equal(created.creatorId, "u1");
  assert.equal(created.creatorName, "Home");
  assert.equal(store.get("u1").events.length, 1);
});

test("update own event", async () => {
  const { svc, store } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [], events: [ev("a", "Shared")], connections: [] },
  });
  const updated = await svc.updateEvent("u1", "me", "a", { ...input, title: "New" });
  assert.equal(updated.title, "New");
  assert.equal(updated.creatorName, "Me");
  assert.equal(store.get("u1").events[0].title, "New");
});

test("update/delete someone else's event is 403", async () => {
  const { svc } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [], events: [], connections: ["u2"] },
    u2: { clerkId: "u2", username: "them", settings: {}, events: [ev("b", "Shared", { creatorId: "u2" })] },
  });
  await assert.rejects(svc.updateEvent("u1", "me", "b", input), (e: any) => e instanceof CalendarError && e.status === 403 && e.message === "You can only edit your own events");
  await assert.rejects(svc.deleteEvent("u1", "me", "b"), (e: any) => e instanceof CalendarError && e.status === 403 && e.message === "You can only delete your own events");
});

test("delete own event", async () => {
  const { svc, store } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [], events: [ev("a", "Shared")], connections: [] },
  });
  await svc.deleteEvent("u1", "me", "a");
  assert.equal(store.get("u1").events.length, 0);
});

test("invalid date and end before start are 400", async () => {
  const { svc } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [], events: [ev("a", "Shared")], connections: [] },
  });
  await rejects400(svc.createEvent("u1", "me", { ...input, startDate: "2026-02-30" }));
  await rejects400(svc.createEvent("u1", "me", { ...input, startDate: "03/01/2026" }));
  await rejects400(svc.createEvent("u1", "me", { ...input, startDate: "2026-03-05", endDate: "2026-03-01" }));
  await rejects400(svc.updateEvent("u1", "me", "a", { ...input, endDate: "nope" }));
  await rejects400(svc.updateEvent("u1", "me", "a", { ...input, startDate: "2026-03-05", endDate: "2026-03-01" }));
});

test("legacy events are normalized and saved back", async () => {
  const { svc, store } = makeService({
    u1: { clerkId: "u1", username: "me", settings: { homeName: "Home" }, people: [], events: [{ id: "old", title: "Old", start: "2025-05-01", end: "2025-05-02" }], connections: [] },
  });
  const events = await svc.listEvents("u1", "me");
  assert.deepEqual(events[0], {
    id: "old", title: "Old", startDate: "2025-05-01", endDate: "2025-05-02", type: "Shared", people: [], creatorId: "u1", creatorName: "Home",
  });
  assert.equal(store.get("u1").events[0].startDate, "2025-05-01");
  assert.equal(store.get("u1").events[0].start, undefined);
});

test("listPeople returns people or empty", async () => {
  const { svc } = makeService({
    u1: { clerkId: "u1", username: "me", settings: {}, people: [{ id: "p", name: "Gran" }], events: [], connections: [] },
  });
  assert.deepEqual(await svc.listPeople("u1", "me"), [{ id: "p", name: "Gran" }]);
});
