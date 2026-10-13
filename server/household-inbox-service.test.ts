import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HouseholdInboxError,
  createHouseholdInboxService,
  sourceKey,
  type HouseholdInboxDeps,
} from "./household-inbox-service";
import { INBOX_KEY_PATTERN } from "@shared/household-inbox";

function makeFake(randomBytesList: number[][] = []) {
  const store: Record<string, any> = {};
  let n = 0;
  let calls = 0;
  const getAt = (path: string) =>
    path === "" ? store : path.split("/").reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), store);
  const setAt = (path: string, value: any) => {
    const keys = path.split("/");
    const last = keys.pop()!;
    let cur = store;
    for (const k of keys) cur = cur[k] ??= {};
    if (value === null) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(value));
  };
  const assertNoUndefined = (v: any) => {
    if (v && typeof v === "object") for (const x of Object.values(v)) assertNoUndefined(x);
    else assert.notEqual(v, undefined);
  };
  const deps: HouseholdInboxDeps = {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++n)),
    random: (len) => {
      const next = randomBytesList[calls++];
      return Uint8Array.from(next ?? Array.from({ length: len }, (_, i) => (calls * 7 + i * 3) % 256));
    },
    async get(path) {
      return getAt(path) ?? null;
    },
    async set(path, value) {
      assertNoUndefined(value);
      setAt(path, value);
    },
    async update(path, values) {
      assertNoUndefined(values);
      for (const [k, v] of Object.entries(values)) setAt(path ? `${path}/${k}` : k, v);
    },
    async remove(path) {
      setAt(path, null);
    },
  };
  return { deps, store };
}

function mailDeps(people: { id: string; name: string }[] = []) {
  const calls: { userId: string; input: any }[] = [];
  return {
    calls,
    mail: {
      async upsertEmails(userId: string, input: any) {
        calls.push({ userId, input });
        return { created: input.emails.length, updated: 0, ids: input.emails.map((e: any) => e.id), pruned: 0 };
      },
    },
    async getPeople() {
      return people;
    },
  };
}

const filled = (b: number) => Array.from({ length: 10 }, () => b);

test("sourceKey lowercases and replaces RTDB-illegal characters", () => {
  const k = sourceKey("  Mom.Smith@Example.COM ");
  assert.equal(k, "mom_smith@example_com");
  assert.doesNotMatch(sourceKey("a.b#c$d[e]f/g@x.y"), /[.#$\[\]/]/);
});

test("getState returns defaults when nothing stored", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  assert.deepEqual(await svc.getState("u1"), {
    enabled: false,
    key: null,
    sources: [],
    organize: { enabled: false },
  });
});

test("enable creates key, index and record in one update; idempotent", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  const state = await svc.enable("u1");
  assert.equal(state.enabled, true);
  assert.match(state.key!, INBOX_KEY_PATTERN);
  assert.equal(store.householdInboxKeys[state.key!], "u1");
  assert.equal(store.householdInbox.u1.enabled, true);
  assert.ok(store.householdInbox.u1.createdAt);
  const again = await svc.enable("u1");
  assert.equal(again.key, state.key);
});

test("enable retries on key collision and 503s after 5 attempts", async () => {
  const { deps, store } = makeFake([filled(0), filled(1)]);
  store.householdInboxKeys = { aaaaaaaaaa: "other" }; // filled(0) -> all 'a'
  const svc = createHouseholdInboxService(deps, mailDeps());
  const state = await svc.enable("u1");
  assert.equal(state.key, "bbbbbbbbbb");

  const all = makeFake([filled(0), filled(0), filled(0), filled(0), filled(0)]);
  all.store.householdInboxKeys = { aaaaaaaaaa: "other" };
  const svc2 = createHouseholdInboxService(all.deps, mailDeps());
  await assert.rejects(svc2.enable("u2"), (e: any) => e instanceof HouseholdInboxError && e.status === 503);
  assert.equal(all.store.householdInbox, undefined);
});

test("disable keeps key and sources; resolveKey requires enabled", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  const { key } = await svc.enable("u1");
  assert.equal(await svc.resolveKey(key!), "u1");
  store.householdInbox.u1.sources = {
    "a@b_co": { email: "a@b.co", status: "pending", firstSeenAt: "2026-01-01T00:00:00.000Z" },
  };
  const off = await svc.disable("u1");
  assert.equal(off.enabled, false);
  assert.equal(off.key, key);
  assert.equal(off.sources.length, 1);
  assert.equal(await svc.resolveKey(key!), null);
  assert.equal(await svc.resolveKey("zzzzzzzzzz"), null);
});

test("rotate replaces key, drops old index and keeps sources", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  const { key: oldKey } = await svc.enable("u1");
  store.householdInbox.u1.sources = {
    "a@b_co": { email: "a@b.co", status: "approved", firstSeenAt: "2026-01-01T00:00:00.000Z" },
  };
  const next = await svc.rotate("u1");
  assert.notEqual(next.key, oldKey);
  assert.equal(store.householdInboxKeys[oldKey!], undefined);
  assert.equal(store.householdInboxKeys[next.key!], "u1");
  assert.equal(next.sources.length, 1);
  assert.equal(await svc.resolveKey(oldKey!), null);
  assert.equal(await svc.resolveKey(next.key!), "u1");
  await assert.rejects(svc.rotate("nobody"), (e: any) => e instanceof HouseholdInboxError && e.status === 404);
});

test("setSourceStatus updates by sanitized key and 404s unknown", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  await svc.enable("u1");
  store.householdInbox.u1.sources = {
    [sourceKey("Mom.S@x.com")]: { email: "mom.s@x.com", status: "pending", firstSeenAt: "t" },
  };
  const state = await svc.setSourceStatus("u1", "MOM.S@x.com", "approved");
  assert.equal(state.sources[0].status, "approved");
  await assert.rejects(
    svc.setSourceStatus("u1", "nope@x.com", "blocked"),
    (e: any) => e instanceof HouseholdInboxError && e.status === 404,
  );
});

test("setOrganize stores enabled and timestamp", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  const on = await svc.setOrganize("u1", true);
  assert.equal(on.organize.enabled, true);
  assert.ok(on.organize.at);
  assert.equal(store.householdInbox.u1.organize.enabled, true);
  const off = await svc.setOrganize("u1", false);
  assert.equal(off.organize.enabled, false);
});

test("getState sorts pending first then by email", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps, mailDeps());
  await svc.enable("u1");
  const mk = (email: string, status: string) => ({ email, status, firstSeenAt: "t" });
  store.householdInbox.u1.sources = {
    a: mk("z@x.com", "pending"),
    b: mk("b@x.com", "approved"),
    c: mk("a@x.com", "approved"),
    d: mk("a@x.com ".trim().replace("a", "c"), "pending"),
  };
  const { sources } = await svc.getState("u1");
  assert.deepEqual(
    sources.map((s) => s.email),
    ["c@x.com", "z@x.com", "a@x.com", "b@x.com"],
  );
});

const msg = (id: string, receivedAt = "2026-02-01T00:00:00.000Z") => ({
  id,
  receivedAt,
  from: { name: "Mom", email: "mom@x.com" },
  subject: "Hi",
  text: "body",
});

async function setup(people: { id: string; name: string }[] = []) {
  const { deps, store } = makeFake();
  const md = mailDeps(people);
  const svc = createHouseholdInboxService(deps, md);
  const { key } = await svc.enable("u1");
  return { svc, store, md, key: key! };
}

const req = (key: string, extra: Record<string, any> = {}) => ({
  key,
  source: "Mom@x.com",
  authenticated: true,
  message: msg("m1"),
  ...extra,
});

test("deliver: unknown key", async () => {
  const { svc } = await setup();
  assert.deepEqual(await svc.deliver(req("zzzzzzzzzz")), { status: "unknown" });
});

test("deliver: verification creates pending source with link, keeps approved", async () => {
  const { svc, store, key } = await setup();
  const v = {
    key,
    source: "forwarding-noreply@google.com",
    authenticated: true,
    verification: { requester: "mom@x.com", confirmUrl: "https://mail-settings.google.com/mail/vf-abc" },
  };
  assert.deepEqual(await svc.deliver(v), { status: "verification", householdId: "u1" });
  const sk = sourceKey("forwarding-noreply@google.com");
  const rec = store.householdInbox.u1.sources[sk];
  assert.equal(rec.status, "pending");
  assert.equal(rec.verifyUrl, v.verification.confirmUrl);
  assert.ok(rec.verifyRequestedAt);
  rec.status = "approved";
  await svc.deliver(v);
  assert.equal(store.householdInbox.u1.sources[sk].status, "approved");
});

test("deliver: blocked source is dropped", async () => {
  const { svc, store, md, key } = await setup();
  store.householdInbox.u1.sources = {
    [sourceKey("mom@x.com")]: { email: "mom@x.com", status: "blocked", firstSeenAt: "t" },
  };
  assert.deepEqual(await svc.deliver(req(key)), { status: "dropped" });
  assert.equal(store.householdInbox.u1.held, undefined);
  assert.equal(md.calls.length, 0);
});

test("deliver: new source is added pending and message held", async () => {
  const { svc, store, md, key } = await setup();
  assert.deepEqual(await svc.deliver(req(key)), { status: "held", householdId: "u1" });
  assert.equal(store.householdInbox.u1.sources[sourceKey("mom@x.com")].status, "pending");
  assert.equal(store.householdInbox.u1.held.m1.message.subject, "Hi");
  assert.equal(md.calls.length, 0);
});

test("deliver: unauthenticated message from approved source is held", async () => {
  const { svc, store, md, key } = await setup();
  store.householdInbox.u1.sources = {
    [sourceKey("mom@x.com")]: { email: "mom@x.com", status: "approved", firstSeenAt: "t" },
  };
  assert.equal((await svc.deliver(req(key, { authenticated: false }))).status, "held");
  assert.ok(store.householdInbox.u1.held.m1);
  assert.equal(md.calls.length, 0);
});

test("deliver: approved authenticated source reaches the mailbox with person match", async () => {
  const people = [{ id: "p1", name: "Zoë Smith" }, { id: "p2", name: "Bob" }];
  const { svc, store, md, key } = await setup(people);
  store.householdInbox.u1.sources = {
    [sourceKey("mom@x.com")]: { email: "mom@x.com", status: "approved", firstSeenAt: "t" },
  };
  store.householdInbox.u1.organize = { enabled: true };
  const r = await svc.deliver(req(key, { personSlug: "zoesmith" }));
  assert.deepEqual(r, { status: "delivered", householdId: "u1", mailId: "hh-m1", personId: "p1", organize: true });
  assert.equal(md.calls[0].userId, "u1");
  assert.deepEqual(md.calls[0].input.emails[0], {
    id: "hh-m1",
    receivedAt: "2026-02-01T00:00:00.000Z",
    from: { name: "Mom", email: "mom@x.com" },
    subject: "Hi",
    text: "body",
    source: "household-email",
    labels: ["household-email"],
    personIds: ["p1"],
  });
});

test("deliver: slug without a matching person gives empty personIds", async () => {
  const { svc, store, md, key } = await setup([{ id: "p2", name: "Bob" }]);
  store.householdInbox.u1.sources = {
    [sourceKey("mom@x.com")]: { email: "mom@x.com", status: "approved", firstSeenAt: "t" },
  };
  const r: any = await svc.deliver(req(key, { personSlug: "nobody" }));
  assert.equal(r.status, "delivered");
  assert.equal(r.personId, undefined);
  assert.equal(r.organize, false);
  assert.deepEqual(md.calls[0].input.emails[0].personIds, []);
});

test("deliver: held cap prunes oldest by receivedAt; redelivery is idempotent", async () => {
  const { svc, store, key } = await setup();
  for (let i = 0; i < 51; i++) {
    const d = new Date(Date.UTC(2026, 1, 1, 0, i)).toISOString();
    await svc.deliver(req(key, { message: msg(`m${i}`, d) }));
  }
  const held = store.householdInbox.u1.held;
  assert.equal(Object.keys(held).length, 50);
  assert.equal(held.m0, undefined);
  assert.ok(held.m50);
  await svc.deliver(req(key, { message: msg("m50", new Date(Date.UTC(2026, 1, 1, 0, 50)).toISOString()) }));
  assert.equal(Object.keys(store.householdInbox.u1.held).length, 50);

  const approved = makeFake();
  const md = mailDeps();
  const svc2 = createHouseholdInboxService(approved.deps, md);
  const { key: k2 } = await svc2.enable("u1");
  approved.store.householdInbox.u1.sources = {
    [sourceKey("mom@x.com")]: { email: "mom@x.com", status: "approved", firstSeenAt: "t" },
  };
  await svc2.deliver(req(k2!));
  await svc2.deliver(req(k2!));
  assert.equal(md.calls.length, 2);
  assert.deepEqual(md.calls[0].input, md.calls[1].input);
  assert.equal(md.calls[0].input.emails[0].id, "hh-m1");
});

test("setSourceStatus approved releases only that source's held messages; blocked deletes", async () => {
  const { svc, store, md, key } = await setup([{ id: "p1", name: "Ann" }]);
  await svc.deliver(req(key, { personSlug: "ann" }));
  await svc.deliver(req(key, { source: "other@x.com", message: msg("m2") }));
  await svc.deliver(req(key, { source: "third@x.com", message: msg("m3") }));
  await svc.setSourceStatus("u1", "mom@x.com", "approved");
  assert.equal(md.calls.length, 1);
  assert.equal(md.calls[0].input.emails[0].id, "hh-m1");
  assert.deepEqual(md.calls[0].input.emails[0].personIds, ["p1"]);
  assert.equal(store.householdInbox.u1.held.m1, undefined);
  assert.ok(store.householdInbox.u1.held.m2);
  await svc.setSourceStatus("u1", "other@x.com", "blocked");
  assert.equal(store.householdInbox.u1.held.m2, undefined);
  assert.ok(store.householdInbox.u1.held.m3);
  assert.equal(md.calls.length, 1);
});
