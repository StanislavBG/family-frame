import { describe, expect, it } from "vitest";
import { buildDataRecordsUrl, buildMailListUrl } from "@/lib/agent-data";

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
