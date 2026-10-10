import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HouseholdProfileError,
  createHouseholdProfileService,
  type HouseholdProfileDeps,
} from "./household-profile-service";
import { EVENTS_SHARING_CONSENT_VERSION } from "@shared/household";

function makeFake() {
  const store: Record<string, any> = {};
  let n = 0;
  let writes = 0;
  const getAt = (path: string) =>
    path.split("/").reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), store);
  const setAt = (path: string, value: any) => {
    const keys = path.split("/");
    const last = keys.pop()!;
    let cur = store;
    for (const k of keys) cur = cur[k] ??= {};
    if (value === null) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(value)); // throws-free; undefined dropped, so check below
  };
  const assertNoUndefined = (v: any) => {
    if (v && typeof v === "object") for (const x of Object.values(v)) assertNoUndefined(x);
    else assert.notEqual(v, undefined);
  };
  const deps: HouseholdProfileDeps = {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++n)),
    async get(path) {
      return getAt(path) ?? null;
    },
    async set(path, value) {
      writes++;
      assertNoUndefined(value);
      setAt(path, value);
    },
    async update(path, values) {
      writes++;
      assertNoUndefined(values);
      for (const [k, v] of Object.entries(values)) setAt(`${path}/${k}`, v);
    },
    async push(path, value) {
      writes++;
      assertNoUndefined(value);
      const id = `-id${++n}`;
      setAt(`${path}/${id}`, value);
      return id;
    },
    async list(path) {
      return getAt(path) ?? null;
    },
  };
  return { deps, store, writes: () => writes };
}

const ADDR = { line1: "1 Main St", city: "Sofia", country: "Bulgaria" };

test("getProfile defaults to sharing disabled", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdProfileService(deps);
  assert.deepEqual(await svc.getProfile("u1"), { eventsSharing: { enabled: false } });
});

test("putAddress validates, stores and sets updatedAt", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await assert.rejects(
    () => svc.putAddress("u1", { line1: "", city: "x", country: "y" }),
    (e: any) => e instanceof HouseholdProfileError && e.status === 400,
  );
  assert.equal(store.householdProfiles, undefined);
  const p = await svc.putAddress("u1", ADDR);
  assert.deepEqual(p.address, ADDR);
  assert.ok(p.updatedAt);
  assert.deepEqual(store.householdProfiles.u1.address, ADDR);
});

test("enabling sharing requires a complete address", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await assert.rejects(
    () => svc.setEventsSharing("u1", true),
    (e: any) =>
      e instanceof HouseholdProfileError &&
      e.status === 409 &&
      e.message === "Add your street address, city and country first",
  );
});

test("enable sets consent fields and logs; disable sets revokedAt and logs", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("u1", ADDR);
  const on = await svc.setEventsSharing("u1", true);
  assert.equal(on.eventsSharing.enabled, true);
  assert.equal(on.eventsSharing.consentVersion, EVENTS_SHARING_CONSENT_VERSION);
  assert.ok(on.eventsSharing.consentedAt);
  assert.equal(on.eventsSharing.revokedAt, undefined);
  const off = await svc.setEventsSharing("u1", false);
  assert.equal(off.eventsSharing.enabled, false);
  assert.ok(off.eventsSharing.revokedAt);
  const log = Object.values(store.householdProfiles.u1.consentLog) as any[];
  assert.deepEqual(log.map((l) => l.action), ["granted", "revoked"]);
  assert.equal(log[0].consentVersion, EVENTS_SHARING_CONSENT_VERSION);
  // re-enabling clears revokedAt
  const again = await svc.setEventsSharing("u1", true);
  assert.equal(again.eventsSharing.revokedAt, undefined);
  assert.equal(Object.keys(store.householdProfiles.u1.consentLog).length, 3);
});

test("setting the same value writes nothing", async () => {
  const { deps, writes } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("u1", ADDR);
  await svc.setEventsSharing("u1", true);
  const before = writes();
  await svc.setEventsSharing("u1", true);
  assert.equal(writes(), before);
  await svc.setEventsSharing("u2", false);
  assert.equal(writes(), before);
});

test("clearing the address while sharing turns sharing off and logs revoked", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("u1", ADDR);
  await svc.setEventsSharing("u1", true);
  const p = await svc.clearAddress("u1");
  assert.equal(p.address, undefined);
  assert.equal(p.eventsSharing.enabled, false);
  assert.ok(p.eventsSharing.revokedAt);
  const log = Object.values(store.householdProfiles.u1.consentLog) as any[];
  assert.deepEqual(log.map((l) => l.action), ["granted", "revoked"]);
});

test("changing the address to an incomplete one is rejected and leaves sharing on", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("u1", ADDR);
  await svc.setEventsSharing("u1", true);
  await assert.rejects(() => svc.putAddress("u1", { ...ADDR, city: "" }), HouseholdProfileError);
  assert.equal((await svc.getProfile("u1")).eventsSharing.enabled, true);
});

test("a complete address change keeps sharing on", async () => {
  const { deps } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("u1", ADDR);
  await svc.setEventsSharing("u1", true);
  const p = await svc.putAddress("u1", { ...ADDR, line1: "2 Side St" });
  assert.equal(p.eventsSharing.enabled, true);
});

test("listSharingHouseholds returns only consented, complete, current-version profiles", async () => {
  const { deps, store } = makeFake();
  const svc = createHouseholdProfileService(deps);
  await svc.putAddress("a", ADDR);
  await svc.setEventsSharing("a", true);
  await svc.putAddress("b", ADDR); // not sharing
  await svc.putAddress("c", ADDR);
  await svc.setEventsSharing("c", true);
  store.householdProfiles.c.eventsSharing.consentVersion = EVENTS_SHARING_CONSENT_VERSION + 1; // stale/other version
  store.householdProfiles.d = { eventsSharing: { enabled: true, consentVersion: EVENTS_SHARING_CONSENT_VERSION } }; // no address
  store.householdProfiles.e = "garbage";
  store.householdProfiles.f = { address: 5, eventsSharing: { enabled: true } };
  const list = await svc.listSharingHouseholds();
  assert.deepEqual(list.map((h) => h.userId), ["a"]);
  assert.deepEqual(list[0].address, ADDR);
  assert.equal(list[0].eventsSharing.enabled, true);
});

test("listSharingHouseholds returns [] when nothing is stored", async () => {
  const { deps } = makeFake();
  assert.deepEqual(await createHouseholdProfileService(deps).listSharingHouseholds(), []);
});
