import { test } from "node:test";
import assert from "node:assert/strict";
import { createGmailClient, extractText, parseHeaders, GmailAuthError } from "./gmail";

type Call = { url: string; method: string; body: string | undefined };

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", body: init.body ? String(init.body) : undefined });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fn, calls };
}

const creds = { clientId: "cid", clientSecret: "sec", refreshToken: "rt" };
const tokenReply = { body: { access_token: "AT", expires_in: 3600 } };

test("token refresh is cached across calls", async () => {
  const { fn, calls } = fakeFetch((url) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) return tokenReply;
    return { body: { messages: [{ id: "a" }] } };
  });
  const gmail = createGmailClient({ ...creds, fetch: fn });
  assert.deepEqual(await gmail.listMessageIds("q", 10), ["a"]);
  await gmail.listMessageIds("q", 10);
  const tokenCalls = calls.filter((c) => c.url.includes("oauth2.googleapis.com"));
  assert.equal(tokenCalls.length, 1);
  assert.match(tokenCalls[0].body ?? "", /grant_type=refresh_token/);
  assert.match(tokenCalls[0].body ?? "", /refresh_token=rt/);
});

test("token is refreshed again when within 60s of expiry", async () => {
  const { fn, calls } = fakeFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) return { body: { access_token: "AT", expires_in: 30 } };
    return { body: {} };
  });
  const gmail = createGmailClient({ ...creds, fetch: fn });
  await gmail.listMessageIds("q", 5);
  await gmail.listMessageIds("q", 5);
  assert.equal(calls.filter((c) => c.url.includes("oauth2.googleapis.com")).length, 2);
});

test("invalid_grant throws GmailAuthError", async () => {
  const { fn } = fakeFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));
  const gmail = createGmailClient({ ...creds, fetch: fn });
  await assert.rejects(gmail.listMessageIds("q", 5), (err: unknown) => {
    assert.ok(err instanceof GmailAuthError);
    assert.match((err as Error).message, /npm run inbox:run -- auth/);
    return true;
  });
});

test("listMessageIds follows pages and caps at max (and 100)", async () => {
  const { fn, calls } = fakeFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) return tokenReply;
    const u = new URL(url);
    const page = u.searchParams.get("pageToken");
    if (!page) return { body: { messages: [{ id: "1" }, { id: "2" }], nextPageToken: "p2" } };
    if (page === "p2") return { body: { messages: [{ id: "3" }, { id: "4" }], nextPageToken: "p3" } };
    return { body: { messages: [{ id: "5" }] } };
  });
  const gmail = createGmailClient({ ...creds, fetch: fn });
  assert.deepEqual(await gmail.listMessageIds("is:unread", 3), ["1", "2", "3"]);
  const list = calls.filter((c) => c.url.includes("/messages?"));
  assert.equal(list.length, 2);
  assert.equal(new URL(list[0].url).searchParams.get("q"), "is:unread");
  assert.equal(new URL(list[0].url).searchParams.get("maxResults"), "3");

  const big = fakeFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) return tokenReply;
    return { body: { messages: [{ id: "x" }] } };
  });
  await createGmailClient({ ...creds, fetch: big.fn }).listMessageIds("q", 5000);
  const first = big.calls.find((c) => c.url.includes("/messages?"))!;
  assert.equal(new URL(first.url).searchParams.get("maxResults"), "100");
});

test("ensureLabel reuses an existing label and caches", async () => {
  const { fn, calls } = fakeFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) return tokenReply;
    return { body: { labels: [{ id: "L1", name: "FF" }] } };
  });
  const gmail = createGmailClient({ ...creds, fetch: fn });
  assert.equal(await gmail.ensureLabel("FF"), "L1");
  assert.equal(await gmail.ensureLabel("FF"), "L1");
  assert.equal(calls.filter((c) => c.url.endsWith("/labels")).length, 1);
  assert.equal(calls.filter((c) => c.method === "POST" && c.url.endsWith("/labels")).length, 0);
});

test("ensureLabel creates a missing label", async () => {
  const { fn, calls } = fakeFetch((url, init) => {
    if (url.includes("oauth2.googleapis.com")) return tokenReply;
    if (init.method === "POST") return { body: { id: "NEW", name: "FF" } };
    return { body: { labels: [{ id: "L1", name: "Other" }] } };
  });
  const gmail = createGmailClient({ ...creds, fetch: fn });
  assert.equal(await gmail.ensureLabel("FF"), "NEW");
  const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/labels"))!;
  assert.equal(JSON.parse(post.body!).name, "FF");
});

test("addLabels posts modify", async () => {
  const { fn, calls } = fakeFetch((url) => (url.includes("oauth2.googleapis.com") ? tokenReply : { body: {} }));
  await createGmailClient({ ...creds, fetch: fn }).addLabels("m1", ["L1"]);
  const c = calls.find((x) => x.url.endsWith("/messages/m1/modify"))!;
  assert.equal(c.method, "POST");
  assert.deepEqual(JSON.parse(c.body!), { addLabelIds: ["L1"] });
});

test("parseHeaders keeps every value in order, lowercased names", () => {
  const h = parseHeaders([
    { name: "Received", value: "a" },
    { name: "RECEIVED", value: "b" },
    { name: "Subject", value: "Hi" },
  ]);
  assert.deepEqual(h.get("received"), ["a", "b"]);
  assert.deepEqual(h.get("subject"), ["Hi"]);
  assert.equal(parseHeaders(undefined).size, 0);
});

test("extractText prefers text/plain in multipart", () => {
  const text = extractText({
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
      {
        mimeType: "multipart/mixed",
        parts: [{ mimeType: "text/plain", body: { data: b64("plain ünï") } }],
      },
    ],
  });
  assert.equal(text, "plain ünï");
});

test("extractText falls back to stripped html", () => {
  const html =
    "<html><head><style>p{color:red}</style></head><body><script>x()</script><p>Hello&nbsp;&amp; &lt;world&gt; &#65;</p></body></html>";
  const text = extractText({ mimeType: "text/html", body: { data: b64(html) } });
  assert.equal(text.replace(/\s+/g, " "), "Hello & <world> A");
});

test("extractText trims to 200000 chars", () => {
  const text = extractText({ mimeType: "text/plain", body: { data: b64("a".repeat(250000)) } });
  assert.equal(text.length, 200000);
});

test("getMessage maps fields", async () => {
  const { fn } = fakeFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) return tokenReply;
    return {
      body: {
        id: "m1",
        threadId: "t1",
        internalDate: "1700000000000",
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "From", value: "a@b.c" }],
          body: { data: b64("body") },
        },
      },
    };
  });
  const m = await createGmailClient({ ...creds, fetch: fn }).getMessage("m1");
  assert.equal(m.id, "m1");
  assert.equal(m.threadId, "t1");
  assert.equal(m.internalDate, new Date(1700000000000).toISOString());
  assert.deepEqual(m.headers.get("from"), ["a@b.c"]);
  assert.equal(m.text, "body");
});
