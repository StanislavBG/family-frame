import { describe, it, expect } from "vitest";
import { pendingSources, approvedSources, type HouseholdInboxView } from "./household-inbox";
import type { InboxSource } from "@shared/household-inbox";

const src = (email: string, status: InboxSource["status"], verifyUrl?: string): InboxSource => ({
  email,
  status,
  firstSeenAt: "2026-10-01T00:00:00.000Z",
  ...(verifyUrl ? { verifyUrl } : {}),
});

const view = (sources: InboxSource[]): HouseholdInboxView => ({
  configured: true,
  enabled: true,
  key: "abcdefghij",
  people: [],
  sources,
  organize: { enabled: false },
});

describe("pendingSources", () => {
  it("returns only pending, verifyUrl first, keeping order otherwise", () => {
    const v = view([
      src("a@x.com", "pending"),
      src("b@x.com", "approved"),
      src("c@x.com", "pending", "https://mail-settings.google.com/c"),
      src("d@x.com", "blocked"),
      src("e@x.com", "pending", "https://mail-settings.google.com/e"),
    ]);
    expect(pendingSources(v).map((s) => s.email)).toEqual(["c@x.com", "e@x.com", "a@x.com"]);
  });

  it("is empty when not configured or undefined", () => {
    expect(pendingSources({ configured: false })).toEqual([]);
    expect(pendingSources(undefined)).toEqual([]);
  });
});

describe("approvedSources", () => {
  it("returns only approved sources in order", () => {
    const v = view([src("a@x.com", "approved"), src("b@x.com", "pending"), src("c@x.com", "approved")]);
    expect(approvedSources(v).map((s) => s.email)).toEqual(["a@x.com", "c@x.com"]);
  });

  it("is empty when not configured", () => {
    expect(approvedSources({ configured: false })).toEqual([]);
  });
});
