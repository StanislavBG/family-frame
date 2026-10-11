import { describe, it, expect } from "vitest";
import { accessFromScopes, scopesFromAccess, type AccessLevel, type TokenAccess } from "./token-scopes";

const LEVELS: AccessLevel[] = ["none", "read", "write"];

describe("scopesFromAccess", () => {
  const base: TokenAccess = { calendarWrite: false, mail: "none", data: "none", media: "none", metrics: "none" };

  it("always includes calendar:read", () => {
    expect(scopesFromAccess(base)).toEqual(["calendar:read"]);
  });

  it("adds calendar:write when requested", () => {
    expect(scopesFromAccess({ ...base, calendarWrite: true })).toEqual(["calendar:read", "calendar:write"]);
  });

  it("write implies read for every resource", () => {
    for (const key of ["mail", "data", "media", "metrics"] as const) {
      expect(scopesFromAccess({ ...base, [key]: "read" })).toEqual(["calendar:read", `${key}:read`]);
      expect(scopesFromAccess({ ...base, [key]: "write" })).toEqual(["calendar:read", `${key}:read`, `${key}:write`]);
    }
  });
});

describe("accessFromScopes", () => {
  it("returns none for an empty scope list", () => {
    expect(accessFromScopes([])).toEqual({ calendarWrite: false, mail: "none", data: "none", media: "none", metrics: "none" });
  });

  it("treats a write scope alone as write", () => {
    expect(accessFromScopes(["metrics:write"]).metrics).toBe("write");
  });

  it("treats a read scope as read", () => {
    expect(accessFromScopes(["media:read"]).media).toBe("read");
  });
});

describe("round trip", () => {
  it("accessFromScopes(scopesFromAccess(a)) equals a for every combination", () => {
    for (const calendarWrite of [false, true]) {
      for (const mail of LEVELS) for (const data of LEVELS) for (const media of LEVELS) for (const metrics of LEVELS) {
        const a: TokenAccess = { calendarWrite, mail, data, media, metrics };
        expect(accessFromScopes(scopesFromAccess(a))).toEqual(a);
      }
    }
  });
});
