import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// query-core sets isServer = typeof window === "undefined" at load time and
// never starts refetchInterval timers on the server. vitest runs in node with
// no DOM, so stub a bare window before query-core is imported (vi.hoisted runs
// ahead of the imports below). The stub has no addEventListener, so the focus
// and online managers stay on their defaults (focused, online).
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window ??= {};
});
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { unreadCountQueryOptions } from "./api";

// Same defaults as client/src/lib/queryClient.ts.
function makeClient(queryFn: () => Promise<{ count: number }>) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
        retry: false,
      },
    },
  });
}

async function runFor(ms: number) {
  for (let t = 0; t < ms; t += 1000) {
    await vi.advanceTimersByTimeAsync(1000);
  }
}

describe("unread count polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the shared options shape", () => {
    expect(unreadCountQueryOptions({ enabled: true, poll: true })).toEqual({
      queryKey: ["/api/messages/unread-count"],
      enabled: true,
      refetchInterval: 30_000,
    });
    expect(unreadCountQueryOptions({ enabled: false, poll: false }).refetchInterval).toBe(false);
  });

  it("one polling + one cache-reading observer fetch about 10 times in 300 s", async () => {
    let calls = 0;
    const client = makeClient(async () => ({ count: ++calls }));
    const poller = new QueryObserver(client, unreadCountQueryOptions({ enabled: true, poll: true }));
    const reader = new QueryObserver(client, unreadCountQueryOptions({ enabled: true, poll: false }));
    const seen: Array<number | undefined> = [];
    const u1 = poller.subscribe(() => {});
    const u2 = reader.subscribe((r) => seen.push((r.data as { count: number } | undefined)?.count));
    await runFor(300_000);
    u1();
    u2();
    expect(Math.abs(calls - 10)).toBeLessThanOrEqual(1);
    // The non-polling observer still sees the latest value from the cache.
    expect(seen[seen.length - 1]).toBe(calls);
    client.clear();
  });

  // The PRD expected the old setup (two polling observers) to cost about 20
  // fetches. It does not in query-core 5.60.5: every query update calls
  // onQueryUpdate -> #updateTimers on every observer, which restarts each
  // observer's interval, so the two timers lock into one rhythm and the second
  // finds the fetch already in flight. This pins the real old cost.
  it("two polling observers (the old setup) also fetch about 10 times in 300 s", async () => {
    let calls = 0;
    const client = makeClient(async () => ({ count: ++calls }));
    const a = new QueryObserver(client, unreadCountQueryOptions({ enabled: true, poll: true }));
    // Offset the second observer, as a later-mounted component would be.
    const u1 = a.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(5_000);
    const b = new QueryObserver(client, unreadCountQueryOptions({ enabled: true, poll: true }));
    const u2 = b.subscribe(() => {});
    await runFor(295_000);
    u1();
    u2();
    expect(Math.abs(calls - 10)).toBeLessThanOrEqual(1);
    client.clear();
  });
});
