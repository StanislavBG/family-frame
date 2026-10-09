import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";
const { createSessionHeaderMiddleware } = await import("./auth");

type FakeReq = {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  path?: string;
  method?: string;
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

async function runWithRes(
  req: FakeReq,
  deps: Parameters<typeof createSessionHeaderMiddleware>[0],
) {
  let nextCalls = 0;
  const out: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  await createSessionHeaderMiddleware(deps)(req as any, res as any, () => {
    nextCalls++;
  });
  return { ...out, next: nextCalls };
}

const PAT = "Bearer ff_pat_" + "a".repeat(43);
const patDeps = (scopes: string[] | null) => ({
  ...okDeps,
  verifyApiToken: async () => (scopes ? { userId: "user_pat", username: "patty", scopes } : null),
});

const okDeps = {
  verifyToken: async () => ({ sub: "user_real" }),
  getUsername: async () => "real",
  verifyApiToken: async () => null,
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
    verifyApiToken: async () => null,
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
  const next = await run(req, { verifyToken: async () => null, getUsername: async () => "u", verifyApiToken: async () => null });
  assert.equal(req.headers["x-clerk-user-id"], undefined);
  assert.equal(next, 1);
});

test("valid PAT sets identity, auth kind and scopes", async () => {
  const req: FakeReq = {
    headers: { authorization: PAT, ...SPOOFED },
    path: "/api/calendar/events",
    method: "GET",
  };
  const r = await runWithRes(req, patDeps(["calendar:read", "calendar:write"]));
  assert.equal(r.next, 1);
  assert.equal(req.headers["x-clerk-user-id"], "user_pat");
  assert.equal(req.headers["x-clerk-username"], "patty");
  assert.equal(req.headers["x-ff-auth"], "pat");
  assert.equal(req.headers["x-ff-scopes"], "calendar:read,calendar:write");
});

test("revoked PAT responds 401 and does not call next", async () => {
  const req: FakeReq = { headers: { authorization: PAT }, path: "/api/calendar/events", method: "GET" };
  const r = await runWithRes(req, patDeps(null));
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: "Invalid API token" });
  assert.equal(r.next, 0);
  assert.equal(req.headers["x-clerk-user-id"], undefined);
});

test("PAT on /api/messages is forbidden", async () => {
  const req: FakeReq = { headers: { authorization: PAT }, path: "/api/messages", method: "GET" };
  const r = await runWithRes(req, patDeps(["calendar:read", "calendar:write"]));
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: "API tokens cannot access this endpoint" });
  assert.equal(r.next, 0);
  assert.equal(req.headers["x-clerk-user-id"], undefined);
});

test("PAT path allowlist covers people list and /mcp only", async () => {
  for (const [path, ok] of [
    ["/api/people/list", true],
    ["/api/people/other", false],
    ["/mcp", true],
    ["/mcp/sse", true],
    ["/api/calendarx", false],
  ] as const) {
    const req: FakeReq = { headers: { authorization: PAT }, path, method: "GET" };
    const r = await runWithRes(req, patDeps(["calendar:read"]));
    assert.equal(r.next, ok ? 1 : 0, path);
  }
});

test("read-only PAT cannot POST /api/calendar/new-event", async () => {
  const req: FakeReq = { headers: { authorization: PAT }, path: "/api/calendar/new-event", method: "POST" };
  const r = await runWithRes(req, patDeps(["calendar:read"]));
  assert.equal(r.status, 403);
  assert.equal(r.next, 0);
});

test("write PAT can POST /api/calendar/new-event", async () => {
  const req: FakeReq = { headers: { authorization: PAT }, path: "/api/calendar/new-event", method: "POST" };
  const r = await runWithRes(req, patDeps(["calendar:write"]));
  assert.equal(r.next, 1);
});

test("spoofed x-ff-auth and x-ff-scopes are stripped", async () => {
  const req: FakeReq = {
    headers: { "x-ff-auth": "pat", "x-ff-scopes": "calendar:write" },
    cookies: {},
  };
  assert.equal(await run(req, okDeps), 1);
  assert.equal(req.headers["x-ff-auth"], undefined);
  assert.equal(req.headers["x-ff-scopes"], undefined);
});

test("cookie session sets x-ff-auth session", async () => {
  const req: FakeReq = { headers: { "x-ff-scopes": "calendar:write" }, cookies: { __session: "good" } };
  assert.equal(await run(req, okDeps), 1);
  assert.equal(req.headers["x-ff-auth"], "session");
  assert.equal(req.headers["x-ff-scopes"], undefined);
});

test("non-ff_pat_ bearer falls through to cookie logic", async () => {
  const req: FakeReq = {
    headers: { authorization: "Bearer eyJhbGci" },
    cookies: { __session: "good" },
    path: "/api/messages",
    method: "GET",
  };
  assert.equal(await run(req, okDeps), 1);
  assert.equal(req.headers["x-clerk-user-id"], "user_real");
});
