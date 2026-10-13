import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInboxFfClient, type DeliverOutcome } from "./ff-inbox-client";
import { GmailAuthError, type GmailClient, type GmailMessage } from "./gmail";
import { INTAKE_QUERY, runOnce } from "./run";

const BASE = "inbox@example.com";

function msg(id: string, tagged = true): GmailMessage {
  const headers = new Map<string, string[]>([
    ["from", ["Alice <alice@example.org>"]],
    ["subject", ["Hello"]],
  ]);
  if (tagged) headers.set("delivered-to", ["inbox+abcd234567@example.com"]);
  return { id, threadId: `t${id}`, internalDate: "2026-10-13T00:00:00.000Z", headers, text: "body" };
}

function fakeGmail(messages: GmailMessage[], opts: { listError?: Error } = {}) {
  const added: { id: string; labels: string[] }[] = [];
  const calls = { query: "", max: -1, ensured: [] as string[] };
  const gmail: GmailClient = {
    async listMessageIds(query, max) {
      if (opts.listError) throw opts.listError;
      calls.query = query;
      calls.max = max;
      return messages.slice(0, max).map((m) => m.id);
    },
    async getMessage(id) {
      return messages.find((m) => m.id === id)!;
    },
    async ensureLabel(name) {
      calls.ensured.push(name);
      return `L-${name}`;
    },
    async addLabels(id, labels) {
      added.push({ id, labels });
    },
  };
  return { gmail, added, calls };
}

function fakeFf(outcomes: DeliverOutcome[]) {
  const bodies: unknown[] = [];
  return {
    bodies,
    ff: {
      async deliver(body: unknown) {
        bodies.push(body);
        return outcomes[bodies.length - 1] ?? { ok: true as const, result: { status: "delivered" } };
      },
    },
  };
}

const ok = (status: string): DeliverOutcome => ({ ok: true, result: { status } });

describe("runOnce", () => {
  it("lists with the intake query and ensures both labels", async () => {
    const g = fakeGmail([msg("1")]);
    await runOnce({ gmail: g.gmail, ff: fakeFf([ok("delivered")]).ff, base: BASE, log: () => {} });
    assert.equal(g.calls.query, INTAKE_QUERY);
    assert.equal(g.calls.max, 50);
    assert.deepEqual(g.calls.ensured, ["ff-routed", "ff-failed"]);
  });

  it("labels skipped messages ff-routed without delivering", async () => {
    const g = fakeGmail([msg("1", false)]);
    const f = fakeFf([]);
    const s = await runOnce({ gmail: g.gmail, ff: f.ff, base: BASE, log: () => {} });
    assert.equal(f.bodies.length, 0);
    assert.equal(s.skipped, 1);
    assert.deepEqual(g.added, [{ id: "1", labels: ["L-ff-routed"] }]);
  });

  it("counts each deliver status and labels ff-routed", async () => {
    const g = fakeGmail([msg("1"), msg("2"), msg("3"), msg("4"), msg("5")]);
    const f = fakeFf([ok("delivered"), ok("held"), ok("verification"), ok("unknown"), ok("dropped")]);
    const s = await runOnce({ gmail: g.gmail, ff: f.ff, base: BASE, log: () => {} });
    assert.deepEqual(s, {
      seen: 5,
      delivered: 1,
      held: 1,
      verification: 1,
      unknown: 1,
      skipped: 1,
      failed: 0,
      stoppedEarly: false,
    });
    assert.ok(g.added.every((a) => a.labels.length === 1 && a.labels[0] === "L-ff-routed"));
    assert.equal(g.added.length, 5);
  });

  it("labels FF 4xx ff-failed and logs the error", async () => {
    const g = fakeGmail([msg("1"), msg("2")]);
    const f = fakeFf([{ ok: false, status: 400, error: "bad body" }, ok("delivered")]);
    const lines: string[] = [];
    const s = await runOnce({ gmail: g.gmail, ff: f.ff, base: BASE, log: (l) => lines.push(l) });
    assert.equal(s.failed, 1);
    assert.equal(s.delivered, 1);
    assert.deepEqual(g.added[0], { id: "1", labels: ["L-ff-failed"] });
    assert.ok(lines[0].includes("bad body"));
  });

  for (const status of [500, 503, 0]) {
    it(`stops without labelling on status ${status}`, async () => {
      const g = fakeGmail([msg("1"), msg("2"), msg("3")]);
      const f = fakeFf([ok("delivered"), { ok: false, status, error: "down" }]);
      const s = await runOnce({ gmail: g.gmail, ff: f.ff, base: BASE, log: () => {} });
      assert.equal(s.stoppedEarly, true);
      assert.equal(s.seen, 2);
      assert.equal(s.delivered, 1);
      assert.equal(f.bodies.length, 2);
      assert.deepEqual(g.added, [{ id: "1", labels: ["L-ff-routed"] }]);
    });
  }

  it("caps the listing at max", async () => {
    const g = fakeGmail([msg("1"), msg("2"), msg("3")]);
    const s = await runOnce({ gmail: g.gmail, ff: fakeFf([]).ff, base: BASE, log: () => {}, max: 2 });
    assert.equal(g.calls.max, 2);
    assert.equal(s.seen, 2);
  });

  it("propagates GmailAuthError", async () => {
    const g = fakeGmail([], { listError: new GmailAuthError("revoked") });
    await assert.rejects(runOnce({ gmail: g.gmail, ff: fakeFf([]).ff, base: BASE, log: () => {} }), GmailAuthError);
  });
});

describe("createInboxFfClient", () => {
  it("rejects non-https base URLs except localhost and 127.0.0.1", () => {
    assert.throws(() => createInboxFfClient({ baseUrl: "http://example.com", token: "t" }), /https/);
    assert.throws(() => createInboxFfClient({ baseUrl: "not a url", token: "t" }), /valid URL/);
    createInboxFfClient({ baseUrl: "https://example.com", token: "t" });
    createInboxFfClient({ baseUrl: "http://localhost:5000", token: "t" });
    createInboxFfClient({ baseUrl: "http://127.0.0.1:5000", token: "t" });
  });

  it("posts with a bearer token and returns the parsed result", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const client = createInboxFfClient({
      baseUrl: "https://ff.example.com/",
      token: "ff_svc_x",
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(JSON.stringify({ status: "held" }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const res = await client.deliver({ a: 1 });
    assert.deepEqual(res, { ok: true, result: { status: "held" } });
    assert.equal(seen?.url, "https://ff.example.com/api/service/inbox/deliver");
    assert.equal((seen?.init.headers as Record<string, string>).Authorization, "Bearer ff_svc_x");
  });

  it("maps HTTP errors, using the JSON error message when present", async () => {
    const make = (body: string, status: number) =>
      createInboxFfClient({
        baseUrl: "https://ff.example.com",
        token: "t",
        fetch: (async () => new Response(body, { status })) as unknown as typeof fetch,
      });
    assert.deepEqual(await make(JSON.stringify({ error: "nope" }), 400).deliver({}), { ok: false, status: 400, error: "nope" });
    assert.deepEqual(await make("oops", 503).deliver({}), {
      ok: false,
      status: 503,
      error: "Family Frame responded with status 503",
    });
  });

  it("maps network errors to status 0", async () => {
    const client = createInboxFfClient({
      baseUrl: "https://ff.example.com",
      token: "t",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    const res = await client.deliver({});
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.status, 0);
  });
});
