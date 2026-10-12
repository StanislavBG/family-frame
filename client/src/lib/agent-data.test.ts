import { describe, expect, it } from "vitest";
import {
  buildDataRecordsUrl,
  buildMailKindsUrl,
  buildMailListUrl,
  buildMediaListUrl,
  kindChipTone,
  mediaUrl,
  showKindChips,
} from "@/lib/agent-data";

describe("buildMailListUrl", () => {
  it("returns the bare path when no params are set", () => {
    expect(buildMailListUrl({})).toBe("/api/mail/messages");
    expect(buildMailListUrl()).toBe("/api/mail/messages");
  });

  it("omits undefined params and maps unreadOnly to unread=1", () => {
    expect(buildMailListUrl({ limit: 10, unreadOnly: true, label: undefined })).toBe(
      "/api/mail/messages?limit=10&unread=1",
    );
    expect(buildMailListUrl({ unreadOnly: false })).toBe("/api/mail/messages");
  });

  it("encodes query values", () => {
    expect(buildMailListUrl({ q: "a b&c", label: "x/y" })).toBe(
      "/api/mail/messages?label=x%2Fy&q=a+b%26c",
    );
  });
});

describe("buildDataRecordsUrl", () => {
  it("encodes the schema id path segment", () => {
    expect(buildDataRecordsUrl("a b/c")).toBe("/api/data/records/a%20b%2Fc");
  });

  it("includes only provided params", () => {
    expect(buildDataRecordsUrl("school", { emailId: "e 1", offset: 0 })).toBe(
      "/api/data/records/school?emailId=e+1&offset=0",
    );
  });
});

describe("mediaUrl", () => {
  it("encodes the id path segment", () => {
    expect(mediaUrl("abc123")).toBe("/api/files/abc123");
    expect(mediaUrl("a b/c?d")).toBe("/api/files/a%20b%2Fc%3Fd");
  });
});

describe("buildMediaListUrl", () => {
  it("returns the bare path when no params are set", () => {
    expect(buildMediaListUrl()).toBe("/api/files");
    expect(buildMediaListUrl({})).toBe("/api/files");
  });

  it("includes only provided params", () => {
    expect(buildMediaListUrl({ kind: "pdf", emailId: "e 1", offset: 0, tag: undefined })).toBe(
      "/api/files?kind=pdf&emailId=e+1&offset=0",
    );
    expect(buildMediaListUrl({ tag: "x/y", limit: 5 })).toBe("/api/files?tag=x%2Fy&limit=5");
  });
});

describe("personId param", () => {
  it("is appended and encoded on mail, media and data record URLs", () => {
    expect(buildMailListUrl({ personId: "kid 1/a" })).toBe("/api/mail/messages?personId=kid+1%2Fa");
    expect(buildMediaListUrl({ personId: "kid 1/a" })).toBe("/api/files?personId=kid+1%2Fa");
    expect(buildDataRecordsUrl("ff-person-day", { personId: "kid 1/a", limit: 7 })).toBe(
      "/api/data/records/ff-person-day?personId=kid+1%2Fa&limit=7",
    );
  });

  it("is omitted when undefined or empty", () => {
    expect(buildMailListUrl({ personId: undefined })).toBe("/api/mail/messages");
    expect(buildMailListUrl({ personId: "" })).toBe("/api/mail/messages");
    expect(buildMediaListUrl({ personId: "" })).toBe("/api/files");
    expect(buildMediaListUrl({ personId: undefined })).toBe("/api/files");
    expect(buildDataRecordsUrl("s", { personId: "" })).toBe("/api/data/records/s");
    expect(buildDataRecordsUrl("s", { personId: undefined })).toBe("/api/data/records/s");
  });
});

describe("buildMailKindsUrl", () => {
  it("returns the bare path without params", () => {
    expect(buildMailKindsUrl({})).toBe("/api/mail/kinds");
    expect(buildMailKindsUrl({ personId: "", label: undefined })).toBe("/api/mail/kinds");
  });

  it("includes personId and label when set", () => {
    expect(buildMailKindsUrl({ personId: "p1", label: "inbox/x" })).toBe(
      "/api/mail/kinds?label=inbox%2Fx&personId=p1",
    );
  });
});

describe("kindChipTone", () => {
  const cycle = ["a", "b", "c", "d"] as const;

  it("prefers the publisher tone", () => {
    expect(kindChipTone("school", "rose", cycle)).toBe("rose");
  });

  it("is deterministic and stays inside the cycle", () => {
    for (let i = 0; i < 200; i++) {
      const kind = `kind-${i}`;
      const t = kindChipTone(kind, undefined, cycle);
      expect(cycle).toContain(t);
      expect(kindChipTone(kind, undefined, cycle)).toBe(t);
    }
  });
});

describe("showKindChips", () => {
  const k = (kind: string) => ({ kind, count: 1, unread: 0 }) as never;
  it("needs at least two kinds", () => {
    expect(showKindChips([])).toBe(false);
    expect(showKindChips([k("a")])).toBe(false);
    expect(showKindChips([k("a"), k("b")])).toBe(true);
  });
});
