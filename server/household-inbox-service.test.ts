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

const filled = (b: number) => Array.from({ length: 10 }, () => b);

test("sourceKey lowercases and replaces RTDB-illegal characters", () => {
  const k = sourceKey("  Mom.Smith@Example.COM ");
  assert.equal(k, "mom_smith@example_com");
  assert.doesNotMatch(sourceKey("a.b#c$d[e]f/g@x.y"), /[.#$\[\]/]/);
});

test("getState returns defaults when nothing stored", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdInboxService(deps);
  assert.deepEqual(await svc.getState("u1"), {
    enabled: false,
    key: null,
    sources: [],
    organize: { enabled: false },
  });
});

test("enable creates key, index and record in one update; idempotent", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps);
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
  const svc = createHouseholdInboxService(deps);
  const state = await svc.enable("u1");
  assert.equal(state.key, "bbbbbbbbbb");

  const all = makeFake([filled(0), filled(0), filled(0), filled(0), filled(0)]);
  all.store.householdInboxKeys = { aaaaaaaaaa: "other" };
  const svc2 = createHouseholdInboxService(all.deps);
  await assert.rejects(svc2.enable("u2"), (e: any) => e instanceof HouseholdInboxError && e.status === 503);
  assert.equal(all.store.householdInbox, undefined);
});

test("disable keeps key and sources; resolveKey requires enabled", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps);
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
  const svc = createHouseholdInboxService(deps);
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
  const svc = createHouseholdInboxService(deps);
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
  const svc = createHouseholdInboxService(deps);
  const on = await svc.setOrganize("u1", true);
  assert.equal(on.organize.enabled, true);
  assert.ok(on.organize.at);
  assert.equal(store.householdInbox.u1.organize.enabled, true);
  const off = await svc.setOrganize("u1", false);
  assert.equal(off.organize.enabled, false);
});

test("getState sorts pending first then by email", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdInboxService(deps);
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
