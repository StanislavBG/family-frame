import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";
const { createSessionHeaderMiddleware } = await import("./auth");

type FakeReq = {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
};

const SPOOFED = {
  "x-clerk-user-id": "user_victim",
  "x-clerk-username": "victim",
};

async function run(
  req: FakeReq,
  deps: Parameters<typeof createSessionHeaderMiddleware>[0],
): Promise<number> {
  let nextCalls = 0;
  await createSessionHeaderMiddleware(deps)(req as any, {} as any, () => {
    nextCalls++;
  });
  return nextCalls;
}

const okDeps = {
  verifyToken: async () => ({ sub: "user_real" }),
  getUsername: async () => "real",
};

test("spoofed headers with no cookie are removed", async () => {
  const req: FakeReq = { headers: { ...SPOOFED }, cookies: {} };
  const next = await run(req, okDeps);
  assert.equal(req.headers["x-clerk-user-id"], undefined);
  assert.equal(req.headers["x-clerk-username"], undefined);
  assert.equal(next, 1);
});

test("spoofed headers with invalid cookie are removed", async () => {
  const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __session: "bad" } };
  const next = await run(req, {
    verifyToken: async () => {
      throw new Error("invalid");
    },
    getUsername: async () => "real",
  });
  assert.equal(req.headers["x-clerk-user-id"], undefined);
  assert.equal(req.headers["x-clerk-username"], undefined);
  assert.equal(next, 1);
});

test("valid cookie sets verified identity over spoofed values", async () => {
  const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __session: "good" } };
  const next = await run(req, okDeps);
  assert.equal(req.headers["x-clerk-user-id"], "user_real");
  assert.equal(req.headers["x-clerk-username"], "real");
  assert.equal(next, 1);
});

test("__clerk_db_jwt cookie is accepted and missing cookies object is safe", async () => {
  const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __clerk_db_jwt: "good" } };
  assert.equal(await run(req, okDeps), 1);
  assert.equal(req.headers["x-clerk-user-id"], "user_real");

  const bare: FakeReq = { headers: { ...SPOOFED } };
  assert.equal(await run(bare, okDeps), 1);
  assert.equal(bare.headers["x-clerk-user-id"], undefined);
});

test("null verification result strips headers and calls next once", async () => {
  const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __session: "x" } };
  const next = await run(req, { verifyToken: async () => null, getUsername: async () => "u" });
  assert.equal(req.headers["x-clerk-user-id"], undefined);
  assert.equal(next, 1);
});
