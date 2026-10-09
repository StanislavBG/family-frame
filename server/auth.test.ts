import { describe, expect, it, vi } from "vitest";
import { createClerkIdentityMiddleware } from "./auth";

type FakeReq = {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
};

const SPOOFED = {
  "x-clerk-user-id": "user_victim",
  "x-clerk-username": "victim",
};

type Deps = Parameters<typeof createClerkIdentityMiddleware>[0];

async function run(req: FakeReq, deps: Deps): Promise<number> {
  const next = vi.fn();
  await createClerkIdentityMiddleware(deps)(req as any, {} as any, next);
  return next.mock.calls.length;
}

const okDeps: Deps = {
  verifyToken: async () => ({ sub: "user_real" }),
  getUser: async () => ({ username: "real", emailAddresses: [] }),
};

describe("createClerkIdentityMiddleware", () => {
  it("strips forged headers when there is no cookie", async () => {
    const req: FakeReq = { headers: { ...SPOOFED }, cookies: {} };
    expect(await run(req, okDeps)).toBe(1);
    expect(req.headers["x-clerk-user-id"]).toBeUndefined();
    expect(req.headers["x-clerk-username"]).toBeUndefined();
  });

  it("strips forged headers when the cookie fails verification", async () => {
    const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __session: "bad" } };
    const next = await run(req, {
      ...okDeps,
      verifyToken: async () => {
        throw new Error("invalid");
      },
    });
    expect(next).toBe(1);
    expect(req.headers["x-clerk-user-id"]).toBeUndefined();
    expect(req.headers["x-clerk-username"]).toBeUndefined();
  });

  it("sets verified identity from a valid cookie, overriding forged values", async () => {
    const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __session: "good" } };
    expect(await run(req, okDeps)).toBe(1);
    expect(req.headers["x-clerk-user-id"]).toBe("user_real");
    expect(req.headers["x-clerk-username"]).toBe("real");
  });

  it("accepts __clerk_db_jwt and tolerates a missing cookies object", async () => {
    const req: FakeReq = { headers: { ...SPOOFED }, cookies: { __clerk_db_jwt: "good" } };
    expect(await run(req, okDeps)).toBe(1);
    expect(req.headers["x-clerk-user-id"]).toBe("user_real");

    const bare: FakeReq = { headers: { ...SPOOFED } };
    expect(await run(bare, okDeps)).toBe(1);
    expect(bare.headers["x-clerk-user-id"]).toBeUndefined();
  });

  it("falls back to the email prefix when the user has no username", async () => {
    const req: FakeReq = { headers: {}, cookies: { __session: "good" } };
    await run(req, {
      ...okDeps,
      getUser: async () => ({
        username: null,
        emailAddresses: [{ emailAddress: "grandma@example.com" }],
      }),
    });
    expect(req.headers["x-clerk-username"]).toBe("grandma");
  });
});
