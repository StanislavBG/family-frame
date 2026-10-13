import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildConsentUrl, exchangeCode, runAuth } from "./auth";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("buildConsentUrl", () => {
  it("sets the offline consent params", () => {
    const u = new URL(buildConsentUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:1/callback", state: "st" }));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("client_id"), "cid");
    assert.equal(u.searchParams.get("redirect_uri"), "http://127.0.0.1:1/callback");
    assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.modify");
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.equal(u.searchParams.get("prompt"), "consent");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("state"), "st");
  });
});

describe("exchangeCode", () => {
  it("returns the refresh token", async () => {
    const { f, calls } = fakeFetch(200, { refresh_token: "rt", access_token: "at" });
    const r = await exchangeCode({ clientId: "c", clientSecret: "s", code: "abc", redirectUri: "http://x/callback", fetch: f });
    assert.deepEqual(r, { refresh_token: "rt" });
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(calls[0].body.get("grant_type"), "authorization_code");
    assert.equal(calls[0].body.get("code"), "abc");
  });

  it("throws when no refresh_token comes back", async () => {
    const { f } = fakeFetch(200, { access_token: "at" });
    await assert.rejects(
      exchangeCode({ clientId: "c", clientSecret: "s", code: "abc", redirectUri: "r", fetch: f }),
      /no refresh_token/,
    );
  });

  it("throws on an HTTP error", async () => {
    const { f } = fakeFetch(400, { error: "invalid_grant" });
    await assert.rejects(
      exchangeCode({ clientId: "c", clientSecret: "s", code: "abc", redirectUri: "r", fetch: f }),
      /400 invalid_grant/,
    );
  });
});

describe("runAuth", () => {
  async function start(overrides: Partial<Parameters<typeof runAuth>[0]> = {}) {
    const dir = await mkdtemp(join(tmpdir(), "inbox-auth-"));
    const tokenFile = join(dir, "nested", "token.json");
    const lines: string[] = [];
    const errs: string[] = [];
    let resolveUrl!: (u: URL) => void;
    const urlSeen = new Promise<URL>((r) => (resolveUrl = r));
    const exchanged: string[] = [];
    const done = runAuth({
      clientId: "cid",
      clientSecret: "sec",
      tokenFile,
      state: "fixed-state",
      now: () => new Date("2026-10-13T00:00:00.000Z"),
      out: (l) => {
        lines.push(l);
        if (l.startsWith("https://")) resolveUrl(new URL(l));
      },
      err: (l) => errs.push(l),
      exchange: async (o) => {
        exchanged.push(o.code);
        return { refresh_token: "rt-1" };
      },
      ...overrides,
    });
    const consent = await urlSeen;
    const callback = new URL(consent.searchParams.get("redirect_uri")!);
    return { dir, tokenFile, lines, errs, exchanged, done, consent, callback };
  }

  it("rejects a state mismatch, then saves the token with mode 0600", async () => {
    const t = await start();
    try {
      assert.equal(t.consent.searchParams.get("state"), "fixed-state");
      assert.equal(t.callback.hostname, "127.0.0.1");

      const bad = await fetch(`${t.callback.origin}/callback?code=x&state=wrong`);
      assert.equal(bad.status, 400);
      await bad.text();
      assert.deepEqual(t.exchanged, []);

      const ok = await fetch(`${t.callback.origin}/callback?code=good&state=fixed-state`);
      assert.equal(ok.status, 200);
      assert.match(await ok.text(), /You can close this tab/);

      assert.equal(await t.done, 0);
      assert.deepEqual(t.exchanged, ["good"]);
      const saved = JSON.parse(await readFile(t.tokenFile, "utf8"));
      assert.deepEqual(saved, { refresh_token: "rt-1", created_at: "2026-10-13T00:00:00.000Z" });
      assert.equal((await stat(t.tokenFile)).mode & 0o777, 0o600);
    } finally {
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  it("exits 1 when the exchange fails", async () => {
    const t = await start({
      exchange: async () => {
        throw new Error("boom");
      },
    });
    try {
      const res = await fetch(`${t.callback.origin}/callback?code=x&state=fixed-state`);
      assert.equal(res.status, 500);
      await res.text();
      assert.equal(await t.done, 1);
      assert.match(t.errs.join("\n"), /boom/);
    } finally {
      await rm(t.dir, { recursive: true, force: true });
    }
  });

  it("gives up with exit 1 after the timeout", async () => {
    const t = await start({ timeoutMs: 50 });
    try {
      assert.equal(await t.done, 1);
      assert.match(t.errs.join("\n"), /timed out/);
    } finally {
      await rm(t.dir, { recursive: true, force: true });
    }
  });
});
