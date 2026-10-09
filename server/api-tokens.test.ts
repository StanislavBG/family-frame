import { test } from "vitest";
import assert from "node:assert/strict";
import {
  API_TOKEN_PREFIX,
  ApiTokenError,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
  type ApiTokenRecord,
  type TokenStore,
} from "./api-tokens";

function memoryStore(): TokenStore & { map: Map<string, ApiTokenRecord> } {
  const map = new Map<string, ApiTokenRecord>();
  return {
    map,
    async get(hash) {
      const rec = map.get(hash);
      return rec ? { ...rec } : null;
    },
    async set(hash, rec) {
      map.set(hash, { ...rec });
    },
    async remove(hash) {
      map.delete(hash);
    },
    async listByUser(userId) {
      return [...map.entries()]
        .filter(([, rec]) => rec.userId === userId)
        .map(([hash, rec]) => ({ hash, rec: { ...rec } }));
    },
  };
}

test("create then verify round trip", async () => {
  const store = memoryStore();
  const { token, record } = await createApiToken(store, "u1", "Claude", ["calendar:read"]);
  assert.ok(token.startsWith(API_TOKEN_PREFIX));
  assert.equal(token.length, API_TOKEN_PREFIX.length + 43);
  assert.equal(record.userId, "u1");
  assert.equal(record.lastUsedAt, null);
  const v = await verifyApiToken(store, token);
  assert.deepEqual(v, { userId: "u1", scopes: ["calendar:read"], id: record.id });
});

test("only the hash is stored", async () => {
  const store = memoryStore();
  const { token } = await createApiToken(store, "u1", "Claude", ["calendar:read", "calendar:write"]);
  const secret = token.slice(API_TOKEN_PREFIX.length);
  const dump = JSON.stringify([...store.map.entries()]);
  assert.ok(!dump.includes(token));
  assert.ok(!dump.includes(secret));
  const [key] = [...store.map.keys()];
  assert.match(key, /^[0-9a-f]{64}$/);
});

test("wrong prefix, unknown and malformed tokens return null", async () => {
  const store = memoryStore();
  const { token } = await createApiToken(store, "u1", "Claude", ["calendar:read"]);
  assert.equal(await verifyApiToken(store, "xx_pat_" + token.slice(API_TOKEN_PREFIX.length)), null);
  assert.equal(await verifyApiToken(store, API_TOKEN_PREFIX + "A".repeat(43)), null);
  assert.equal(await verifyApiToken(store, ""), null);
  assert.equal(await verifyApiToken(store, undefined as unknown as string), null);
  assert.equal(await verifyApiToken(store, API_TOKEN_PREFIX + "!!"), null);
});

test("lastUsedAt updates at most once per hour", async () => {
  const store = memoryStore();
  const { token } = await createApiToken(store, "u1", "Claude", ["calendar:read"]);
  await verifyApiToken(store, token);
  const first = [...store.map.values()][0].lastUsedAt;
  assert.ok(first);
  await verifyApiToken(store, token);
  assert.equal([...store.map.values()][0].lastUsedAt, first);
});

test("verify survives a failing lastUsedAt write", async () => {
  const store = memoryStore();
  const { token } = await createApiToken(store, "u1", "Claude", ["calendar:read"]);
  store.set = async () => {
    throw new Error("boom");
  };
  assert.ok(await verifyApiToken(store, token));
});

test("caps at 10 tokens per user", async () => {
  const store = memoryStore();
  for (let i = 0; i < 10; i++) await createApiToken(store, "u1", `t${i}`, ["calendar:read"]);
  await assert.rejects(createApiToken(store, "u1", "extra", ["calendar:read"]), ApiTokenError);
  await createApiToken(store, "u2", "other", ["calendar:read"]);
});

test("validates name and scopes", async () => {
  const store = memoryStore();
  await assert.rejects(createApiToken(store, "u1", "", ["calendar:read"]), ApiTokenError);
  await assert.rejects(createApiToken(store, "u1", "   ", ["calendar:read"]), ApiTokenError);
  await assert.rejects(createApiToken(store, "u1", "x".repeat(61), ["calendar:read"]), ApiTokenError);
  await assert.rejects(createApiToken(store, "u1", "ok", []), ApiTokenError);
  await assert.rejects(createApiToken(store, "u1", "ok", ["admin" as never]), ApiTokenError);
  await createApiToken(store, "u1", "x".repeat(60), ["calendar:read"]);
  assert.equal(store.map.size, 1);
});

test("revoke is isolated per user", async () => {
  const store = memoryStore();
  const a = await createApiToken(store, "u1", "a", ["calendar:read"]);
  const b = await createApiToken(store, "u2", "b", ["calendar:read"]);
  assert.equal(await revokeApiToken(store, "u2", a.record.id), false);
  assert.ok(await verifyApiToken(store, a.token));
  assert.equal(await revokeApiToken(store, "u1", "nope"), false);
  assert.equal(await revokeApiToken(store, "u1", a.record.id), true);
  assert.equal(await verifyApiToken(store, a.token), null);
  assert.ok(await verifyApiToken(store, b.token));
});

test("listApiTokens is newest first and hides hashes", async () => {
  const store = memoryStore();
  const t1 = await createApiToken(store, "u1", "first", ["calendar:read"]);
  const t2 = await createApiToken(store, "u1", "second", ["calendar:read"]);
  // force distinct, known timestamps
  for (const [hash, rec] of store.map) {
    rec.createdAt = rec.id === t1.record.id ? "2026-01-01T00:00:00.000Z" : "2026-02-01T00:00:00.000Z";
    store.map.set(hash, rec);
  }
  const list = await listApiTokens(store, "u1");
  assert.deepEqual(list.map((r) => r.id), [t2.record.id, t1.record.id]);
  assert.ok(!JSON.stringify(list).match(/[0-9a-f]{64}/));
  assert.deepEqual(await listApiTokens(store, "nobody"), []);
});
