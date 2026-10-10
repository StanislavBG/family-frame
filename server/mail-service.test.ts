import { test } from "node:test";
import assert from "node:assert/strict";
import { createMailService, MailError } from "./mail-service";
import { MAIL_LIMITS } from "@shared/agent-data";

function setPath(root: any, parts: string[], value: any) {
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete cur[last];
  else cur[last] = structuredClone(value);
}

function makeService() {
  const db: any = {};
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const getAt = (path: string) => path.split("/").reduce((c: any, k) => (c == null ? c : c[k]), db);
  const svc = createMailService({
    async get(path) {
      const v = getAt(path);
      return v === undefined ? null : structuredClone(v);
    },
    async set(path, value) {
      setPath(db, path.split("/"), value);
    },
    async update(path, values) {
      for (const [k, v] of Object.entries(values)) setPath(db, [...path.split("/"), ...k.split("/")], v);
    },
    async remove(path) {
      setPath(db, path.split("/"), null);
    },
    now: () => clock,
  });
  return { svc, db, tick: (iso: string) => (clock = new Date(iso)) };
}

const mail = (id: string, extra: any = {}) => ({
  id,
  receivedAt: "2026-02-01T10:00:00.000Z",
  from: { name: "Ann", email: "ann@example.com" },
  subject: `Subject ${id}`,
  text: `Body of  ${id}\n\nmore`,
  ...extra,
});

async function rejects400(p: Promise<unknown>) {
  await assert.rejects(p, (e: any) => e instanceof MailError && e.status === 400);
}

test("upsert creates then updates, preserving ingestedAt and readAt", async () => {
  const { svc, db, tick } = makeService();
  const r1 = await svc.upsertEmails("u1", { emails: [mail("a"), mail("b")] });
  assert.deepEqual({ created: r1.created, updated: r1.updated, pruned: r1.pruned }, { created: 2, updated: 0, pruned: 0 });
  assert.deepEqual(r1.ids, ["a", "b"]);
  assert.equal(db.mailbox.u1.bodies.a.text, "Body of  a\n\nmore");
  assert.equal(db.mailbox.u1.index.a.text, undefined);
  assert.equal(db.mailbox.u1.index.a.snippet, "Body of a more");

  await svc.setRead("u1", ["a"], true);
  tick("2026-03-01T00:00:00.000Z");
  const r2 = await svc.upsertEmails("u1", { emails: [mail("a", { subject: "New" })] });
  assert.equal(r2.updated, 1);
  const got = await svc.getEmail("u1", "a");
  assert.equal(got?.subject, "New");
  assert.equal(got?.ingestedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(got?.updatedAt, "2026-03-01T00:00:00.000Z");
  assert.equal(got?.readAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(got?.labels, []);
  assert.equal(await svc.getEmail("u1", "zzz"), null);
});

test("snippet is derived only when absent and capped at 200", async () => {
  const { svc } = makeService();
  await svc.upsertEmails("u1", { emails: [mail("a", { text: "x ".repeat(300) }), mail("b", { snippet: "given" })] });
  assert.equal((await svc.getEmail("u1", "a"))?.snippet.length, 200);
  assert.equal((await svc.getEmail("u1", "b"))?.snippet, "given");
});

test("validation errors are 400", async () => {
  const { svc } = makeService();
  await rejects400(svc.upsertEmails("u1", { emails: [] }));
  await rejects400(svc.upsertEmails("u1", { emails: [{ id: "bad id" }] }));
  await rejects400(svc.upsertEmails("u1", { emails: [mail("a"), mail("a")] }));
  await assert.rejects(svc.upsertEmails("u1", { emails: [mail("a", { receivedAt: "nope" })] }), (e: any) =>
    e.status === 400 && e.message.includes("emails.0.receivedAt"));
});

test("prunes oldest beyond mailboxMax from index and bodies", async () => {
  const { svc, db } = makeService();
  const seed: any = {};
  const bodies: any = {};
  for (let i = 0; i < MAIL_LIMITS.mailboxMax; i++) {
    const id = `m${i}`;
    seed[id] = {
      id, receivedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      from: { email: "a@b.c" }, subject: id, snippet: "", ingestedAt: "x", updatedAt: "x",
    };
    bodies[id] = { text: id };
  }
  db.mailbox = { u1: { index: seed, bodies } };
  const r = await svc.upsertEmails("u1", { emails: [mail("new", { receivedAt: "2027-01-01T00:00:00.000Z" })] });
  assert.equal(r.pruned, 1);
  assert.equal(db.mailbox.u1.index.m0, undefined);
  assert.equal(db.mailbox.u1.bodies.m0, undefined);
  assert.ok(db.mailbox.u1.index.new);
  assert.equal(Object.keys(db.mailbox.u1.index).length, MAIL_LIMITS.mailboxMax);
});

test("list filters, sorting and cursor", async () => {
  const { svc } = makeService();
  await svc.upsertEmails("u1", {
    emails: [
      mail("a", { receivedAt: "2026-02-01T00:00:00.000Z", labels: ["school"], kind: "newsletter", subject: "Field Trip" }),
      mail("b", { receivedAt: "2026-02-02T00:00:00.000Z", from: { name: "Bob", email: "bob@school.org" } }),
      mail("c", { receivedAt: "2026-02-03T00:00:00.000Z", kind: "newsletter", text: "pizza day" }),
    ],
  });
  await svc.setRead("u1", ["c"], true);

  const all = await svc.listEmails("u1");
  assert.deepEqual(all.emails.map((e) => e.id), ["c", "b", "a"]);
  assert.equal(all.nextBefore, null);
  assert.ok(all.emails.every((e) => !("text" in e) && Array.isArray(e.to) && Array.isArray(e.attachments)));

  const p1 = await svc.listEmails("u1", { limit: 2 });
  assert.deepEqual(p1.emails.map((e) => e.id), ["c", "b"]);
  assert.equal(p1.nextBefore, "2026-02-02T00:00:00.000Z");
  const p2 = await svc.listEmails("u1", { limit: 2, before: p1.nextBefore! });
  assert.deepEqual(p2.emails.map((e) => e.id), ["a"]);
  assert.equal(p2.nextBefore, null);

  assert.deepEqual((await svc.listEmails("u1", { label: "school" })).emails.map((e) => e.id), ["a"]);
  assert.deepEqual((await svc.listEmails("u1", { kind: "newsletter" })).emails.map((e) => e.id), ["c", "a"]);
  assert.deepEqual((await svc.listEmails("u1", { unreadOnly: true })).emails.map((e) => e.id), ["b", "a"]);
  assert.deepEqual((await svc.listEmails("u1", { q: "FIELD" })).emails.map((e) => e.id), ["a"]);
  assert.deepEqual((await svc.listEmails("u1", { q: "bob" })).emails.map((e) => e.id), ["b"]);
  assert.deepEqual((await svc.listEmails("u1", { q: "pizza" })).emails.map((e) => e.id), ["c"]);
  assert.equal((await svc.listEmails("u1", { limit: 0 })).emails.length, 1);
  assert.equal((await svc.listEmails("u1", { limit: 9999 })).emails.length, 3);
});

test("setRead all, unread, unreadCount, delete", async () => {
  const { svc, db } = makeService();
  await svc.upsertEmails("u1", { emails: [mail("a"), mail("b")] });
  assert.equal(await svc.unreadCount("u1"), 2);
  assert.deepEqual(await svc.setRead("u1", "all", true), { updated: 2 });
  assert.equal(await svc.unreadCount("u1"), 0);
  assert.deepEqual(await svc.setRead("u1", ["a"], false), { updated: 1 });
  assert.equal((await svc.getEmail("u1", "a"))?.readAt, null);
  assert.equal(await svc.unreadCount("u1"), 1);

  assert.equal(await svc.deleteEmail("u1", "a"), true);
  assert.equal(await svc.deleteEmail("u1", "a"), false);
  assert.equal(db.mailbox.u1.bodies.a, undefined);
  assert.equal(await svc.getEmail("u1", "a"), null);
});

test("users cannot see each other's emails", async () => {
  const { svc, db } = makeService();
  await svc.upsertEmails("A", { emails: [mail("a")] });
  assert.deepEqual((await svc.listEmails("B")).emails, []);
  assert.equal(await svc.getEmail("B", "a"), null);
  assert.equal(await svc.deleteEmail("B", "a"), false);
  assert.deepEqual(await svc.setRead("B", "all", true), { updated: 0 });
  assert.equal(await svc.unreadCount("B"), 0);
  assert.equal(db.users, undefined);
  assert.ok((await svc.getEmail("A", "a")));
});
