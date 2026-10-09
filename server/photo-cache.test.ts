import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhotoCache, photoCacheKey } from "./photo-cache";

function makeDeps(fetchImpl: typeof fetch) {
  const store = new Map<string, any>();
  const deps = {
    async get(path: string) {
      return store.has(path) ? structuredClone(store.get(path)) : null;
    },
    async set(path: string, value: any) {
      store.set(path, structuredClone(value));
    },
    async remove(path: string) {
      for (const k of [...store.keys()]) {
        if (k === path || k.startsWith(`${path}/`)) store.delete(k);
      }
    },
    fetch: fetchImpl,
  };
  return { deps, store };
}

function imageResponse(bytes: Buffer, type = "image/jpeg") {
  return new Response(bytes, { status: 200, headers: { "content-type": type } });
}

const photo = (id: string) => ({ id, baseUrl: `https://lh3.googleusercontent.com/${id}` });

test("photoCacheKey is Firebase-safe for ids with . and /", () => {
  const key = photoCacheKey("a.b/c#d$e[f]");
  assert.doesNotMatch(key, /[.#$\[\]/]/);
  assert.equal(key, "a%2Eb%2Fc%23d%24e%5Bf%5D");
});

test("cachePhoto then getCachedPhoto round-trips bytes", async () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 255]);
  let seen: { url: string; init: any } | null = null;
  const { deps, store } = makeDeps((async (url: any, init: any) => {
    seen = { url: String(url), init };
    return imageResponse(bytes);
  }) as typeof fetch);
  const cache = createPhotoCache(deps);
  assert.equal(await cache.cachePhoto("u1", photo("p.1/x"), "tok"), true);
  assert.equal(seen!.url, "https://lh3.googleusercontent.com/p.1/x=w1920-h1080");
  assert.equal(seen!.init.headers.Authorization, "Bearer tok");
  assert.ok(seen!.init.signal);
  assert.ok(store.has(`photoCache/u1/${photoCacheKey("p.1/x")}`));
  const got = await cache.getCachedPhoto("u1", "p.1/x");
  assert.deepEqual(got!.buffer, bytes);
  assert.equal(got!.mimeType, "image/jpeg");
  assert.equal(await cache.getCachedPhoto("u1", "missing"), null);
});

test("non-image content-type returns false and stores nothing", async () => {
  const { deps, store } = makeDeps((async () => imageResponse(Buffer.from("<html>"), "text/html")) as typeof fetch);
  const cache = createPhotoCache(deps);
  assert.equal(await cache.cachePhoto("u1", photo("a"), "tok"), false);
  assert.equal(store.size, 0);
});

test("fetch throwing returns false", async () => {
  const { deps, store } = makeDeps((async () => {
    throw new Error("boom");
  }) as typeof fetch);
  const cache = createPhotoCache(deps);
  assert.equal(await cache.cachePhoto("u1", photo("a"), "tok"), false);
  assert.equal(store.size, 0);
});

test("oversize body returns false", async () => {
  const { deps, store } = makeDeps((async () => imageResponse(Buffer.alloc(8 * 1024 * 1024 + 1))) as typeof fetch);
  const cache = createPhotoCache(deps);
  assert.equal(await cache.cachePhoto("u1", photo("a"), "tok"), false);
  assert.equal(store.size, 0);
});

test("cachePhotos respects concurrency and returns only successes", async () => {
  let inFlight = 0;
  let max = 0;
  const { deps } = makeDeps((async (url: any) => {
    inFlight++;
    max = Math.max(max, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    if (String(url).includes("bad")) return new Response("no", { status: 404 });
    return imageResponse(Buffer.from("x"));
  }) as typeof fetch);
  const cache = createPhotoCache(deps);
  const photos = ["a", "b", "bad1", "c", "d", "bad2", "e", "f"].map(photo);
  const ok = await cache.cachePhotos("u1", photos, "tok", 3);
  assert.ok(max <= 3 && max > 1, `max in flight ${max}`);
  assert.deepEqual(ok.sort(), ["a", "b", "c", "d", "e", "f"]);
});

test("concurrent cachePhotos for one user share a promise", async () => {
  let calls = 0;
  const { deps } = makeDeps((async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return imageResponse(Buffer.from("x"));
  }) as typeof fetch);
  const cache = createPhotoCache(deps);
  const p1 = cache.cachePhotos("u1", [photo("a")], "tok");
  const p2 = cache.cachePhotos("u1", [photo("a")], "tok");
  assert.equal(p1, p2);
  await p1;
  assert.equal(calls, 1);
  const p3 = cache.cachePhotos("u1", [photo("a")], "tok");
  assert.notEqual(p3, p1);
  await p3;
});

test("removeCachedPhoto and removeAllCachedPhotos clear entries", async () => {
  const { deps, store } = makeDeps((async () => imageResponse(Buffer.from("x"))) as typeof fetch);
  const cache = createPhotoCache(deps);
  await cache.cachePhotos("u1", [photo("a"), photo("b")], "tok");
  await cache.cachePhotos("u2", [photo("a")], "tok");
  await cache.removeCachedPhoto("u1", "a");
  assert.equal(await cache.getCachedPhoto("u1", "a"), null);
  assert.ok(await cache.getCachedPhoto("u1", "b"));
  await cache.removeAllCachedPhotos("u1");
  assert.equal(await cache.getCachedPhoto("u1", "b"), null);
  assert.ok(await cache.getCachedPhoto("u2", "a"));
  assert.ok([...store.keys()].every((k) => k.startsWith("photoCache/u2/")));
});

test("non-Google baseUrl is rejected without fetching or sending the token", async () => {
  let calls = 0;
  const { deps, store } = makeDeps((async () => {
    calls++;
    return imageResponse(Buffer.from("x"));
  }) as typeof fetch);
  const cache = createPhotoCache(deps);
  assert.equal(await cache.cachePhoto("u1", { id: "a", baseUrl: "https://evil.example/a" }, "tok"), false);
  assert.equal(calls, 0);
  assert.equal(store.size, 0);
});
