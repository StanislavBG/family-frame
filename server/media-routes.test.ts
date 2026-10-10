import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { registerMediaRoutes } from "./media-routes";
import { MediaError, type MediaStore } from "./media-store";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const META = {
  id: "abc", filename: "café \"x\"\r\n.png", mimeType: "image/png", kind: "image", size: PNG.length,
  sha256: "h", tags: [], emailIds: [], createdAt: "2026-01-01T00:00:00.000Z",
};

const calls: any[] = [];
let created = true;
const store: any = {
  putMedia: async (...a: any[]) => {
    calls.push(["putMedia", ...a]);
    if (a[1].mimeType === "text/plain") throw new MediaError("Unsupported file type", 415);
    return { meta: META, created };
  },
  getMedia: async (_u: string, id: string) => (id === "abc" ? { meta: META, buffer: PNG } : null),
  listMedia: async (...a: any[]) => (calls.push(["listMedia", ...a]), { items: [META], total: 1, usage: { bytes: 1, count: 1 } }),
  deleteMedia: async (_u: string, id: string) => id === "abc",
};

const importCalls: any[] = [];
let importCreated = true;
const importer: any = {
  importFromUrl: async (userId: string, input: any) => {
    importCalls.push([userId, input]);
    if (input.url === "https://blocked.example.com/x.png") throw new MediaError("URL not allowed", 400);
    if (input.url === "https://down.example.com/x.png") throw new MediaError("Upstream fetch failed", 502);
    return { meta: META, created: importCreated, fetched: importCreated };
  },
};

let server: Server;
let base: string;
const auth = { "x-clerk-user-id": "u1" };

before(async () => {
  const app = express();
  registerMediaRoutes(app, store as MediaStore, importer);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

test("upload returns 201 then 200 when deduped, passing parsed query", async () => {
  const url = `${base}/api/files?filename=a.png&id=abc&tags=x,%20y,&emailIds=e1`;
  const r1 = await fetch(url, { method: "POST", headers: { ...auth, "content-type": "image/png" }, body: PNG });
  assert.equal(r1.status, 201);
  assert.equal((await r1.json() as any).id, "abc");
  const put = calls.find((c) => c[0] === "putMedia")!;
  assert.equal(put[1], "u1");
  assert.equal(put[2].mimeType, "image/png");
  assert.equal(put[2].id, "abc");
  assert.deepEqual(put[2].tags, ["x", "y"]);
  assert.deepEqual(put[2].emailIds, ["e1"]);
  assert.ok(Buffer.compare(put[2].buffer, PNG) === 0);
  created = false;
  const r2 = await fetch(url, { method: "POST", headers: { ...auth, "content-type": "image/png" }, body: PNG });
  assert.equal(r2.status, 200);
  created = true;
});

test("upload maps MediaError (415) and rejects empty body (400)", async () => {
  const bad = await fetch(`${base}/api/files?filename=a.txt`, { method: "POST", headers: { ...auth, "content-type": "text/plain" }, body: "hello" });
  assert.equal(bad.status, 415);
  assert.deepEqual(await bad.json(), { error: "Unsupported file type" });
  const empty = await fetch(`${base}/api/files?filename=a.png`, { method: "POST", headers: { ...auth, "content-type": "image/png" } });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: "Empty body" });
});

test("serve sets safe headers and sends bytes", async () => {
  const res = await fetch(`${base}/api/files/abc`, { headers: auth });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(res.headers.get("content-disposition"), 'inline; filename="caf x.png"');
  assert.equal(res.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.ok(Buffer.compare(Buffer.from(await res.arrayBuffer()), PNG) === 0);
});

test("list, meta, delete and 404s", async () => {
  const list = await fetch(`${base}/api/files?kind=image&tag=t&limit=5&offset=2`, { headers: auth });
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as any).total, 1);
  assert.deepEqual(calls.find((c) => c[0] === "listMedia")!.slice(1), ["u1", { kind: "image", tag: "t", emailId: undefined, limit: 5, offset: 2 }]);
  assert.equal(((await (await fetch(`${base}/api/files/abc/meta`, { headers: auth })).json()) as any).id, "abc");
  assert.equal((await fetch(`${base}/api/files/nope/meta`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}/api/files/nope`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}/api/files/abc`, { method: "DELETE", headers: auth })).status, 204);
  assert.equal((await fetch(`${base}/api/files/nope`, { method: "DELETE", headers: auth })).status, 404);
});

test("401 without x-clerk-user-id on every route", async () => {
  const cases: [string, string][] = [
    ["POST", "/api/files?filename=a.png"], ["GET", "/api/files"], ["GET", "/api/files/abc/meta"],
    ["GET", "/api/files/abc"], ["DELETE", "/api/files/abc"],
  ];
  for (const [method, path] of cases) {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "image/png" }, body: method === "POST" ? PNG : undefined });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

const postImport = (body: unknown, headers: Record<string, string> = auth) =>
  fetch(`${base}/api/files/import`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });

test("import returns 201 then 200 when deduped, passing the parsed body", async () => {
  const body = { url: "https://cdn.example.com/a.png", id: "abc", filename: "a.png", tags: ["x"], emailIds: ["e1"] };
  const r1 = await postImport(body);
  assert.equal(r1.status, 201);
  const j1 = await r1.json() as any;
  assert.equal(j1.created, true);
  assert.equal(j1.meta.id, "abc");
  assert.deepEqual(importCalls.at(-1), ["u1", body]);
  importCreated = false;
  const r2 = await postImport(body);
  assert.equal(r2.status, 200);
  assert.equal(((await r2.json()) as any).created, false);
  importCreated = true;
});

test("import rejects invalid bodies (400), maps MediaError and requires auth", async () => {
  const before = importCalls.length;
  assert.equal((await postImport({})).status, 400);
  assert.equal((await postImport({ url: "https://x.example.com/" + "a".repeat(2048) })).status, 400);
  assert.equal((await postImport({ url: "https://cdn.example.com/a.png", tags: "x" })).status, 400);
  assert.equal(importCalls.length, before);
  const blocked = await postImport({ url: "https://blocked.example.com/x.png" });
  assert.equal(blocked.status, 400);
  assert.deepEqual(await blocked.json(), { error: "URL not allowed" });
  const down = await postImport({ url: "https://down.example.com/x.png" });
  assert.equal(down.status, 502);
  assert.equal((await postImport({ url: "https://cdn.example.com/a.png" }, {})).status, 401);
});
