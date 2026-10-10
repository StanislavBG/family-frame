import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_LIMITS,
  MediaError,
  createMediaStore,
  sniffMediaType,
  type MediaDeps,
} from "./media-store";

function makeDeps(start = Date.parse("2026-01-01T00:00:00Z")) {
  let root: any = {};
  let tick = start;
  const segs = (p: string) => p.split("/").filter(Boolean);
  const setAt = (path: string, value: any) => {
    const parts = segs(path);
    if (value === null || value === undefined) {
      let node = root;
      for (const s of parts.slice(0, -1)) {
        node = node?.[s];
        if (!node || typeof node !== "object") return;
      }
      delete node[parts[parts.length - 1]];
      return;
    }
    let node = root;
    for (const s of parts.slice(0, -1)) {
      if (!node[s] || typeof node[s] !== "object") node[s] = {};
      node = node[s];
    }
    node[parts[parts.length - 1]] = structuredClone(value);
  };
  const deps: MediaDeps = {
    async get(path) {
      let node = root;
      for (const s of segs(path)) {
        node = node?.[s];
        if (node === undefined) return null;
      }
      return structuredClone(node);
    },
    async set(path, value) {
      setAt(path, value);
    },
    async update(path, values) {
      for (const [k, v] of Object.entries(values)) setAt(`${path}/${k}`, v);
    },
    async remove(path) {
      setAt(path, null);
    },
    now: () => new Date((tick += 1000)),
  };
  return { deps, dump: () => root };
}

const jpeg = (extra = "") => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`jfif${extra}`)]);
const png = (extra = "") =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(extra)]);
const pdf = (extra = "") => Buffer.from(`%PDF-1.7 ${extra}`);

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (err: unknown) => err instanceof MediaError && err.status === status);
}

test("sniffMediaType recognises allowed types", () => {
  assert.equal(sniffMediaType(jpeg()), "image/jpeg");
  assert.equal(sniffMediaType(png()), "image/png");
  assert.equal(sniffMediaType(Buffer.from("GIF87a....")), "image/gif");
  assert.equal(sniffMediaType(Buffer.from("GIF89a....")), "image/gif");
  assert.equal(sniffMediaType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(sniffMediaType(pdf()), "application/pdf");
});

test("sniffMediaType returns null for scriptable or unknown content", () => {
  assert.equal(sniffMediaType(Buffer.from("<!doctype html><script>1</script>")), null);
  assert.equal(sniffMediaType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffMediaType(Buffer.alloc(0)), null);
  assert.equal(sniffMediaType(Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt ", "latin1")), null);
});

test("putMedia stores and getMedia returns the bytes", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const buf = jpeg("a");
  const { meta, created } = await store.putMedia("u1", { filename: "a.jpg", mimeType: "image/jpeg", buffer: buf });
  assert.equal(created, true);
  assert.equal(meta.kind, "image");
  assert.equal(meta.size, buf.length);
  assert.equal(meta.id.length, 32);
  assert.deepEqual(meta.tags, []);
  const got = await store.getMedia("u1", meta.id);
  assert.ok(got);
  assert.ok(got.buffer.equals(buf));
  assert.equal(got.meta.mimeType, "image/jpeg");
  assert.equal(await store.getMedia("u1", "nope"), null);
  assert.equal(await store.getMedia("u1", "bad.id/x"), null);
});

test("putMedia marks PDFs as kind pdf and sanitizes filename", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const { meta } = await store.putMedia("u1", {
    filename: "  ../dir\\report\u0000.pdf ",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  assert.equal(meta.kind, "pdf");
  assert.ok(!/[\\/\u0000-\u001f]/.test(meta.filename));
  assert.ok(meta.filename.endsWith("report.pdf"));
});

test("putMedia rejects 415 for unsniffable or mismatched content", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  await rejects(
    store.putMedia("u1", { filename: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html></html>") }),
    415,
  );
  await rejects(store.putMedia("u1", { filename: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) }), 415);
  await rejects(store.putMedia("u1", { filename: "x.png", mimeType: "image/png", buffer: jpeg() }), 415);
  await rejects(store.putMedia("u1", { filename: "x.svg", mimeType: "image/svg+xml", buffer: png() }), 415);
});

test("putMedia rejects 413 over the per-file limit", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const big = Buffer.concat([jpeg(), Buffer.alloc(MEDIA_LIMITS.fileBytesMax)]);
  await rejects(store.putMedia("u1", { filename: "big.jpg", mimeType: "image/jpeg", buffer: big }), 413);
});

test("putMedia rejects 400 for bad id, filename, tags and emailIds", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const base = { filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg() };
  await rejects(store.putMedia("u1", { ...base, id: "bad.id" }), 400);
  await rejects(store.putMedia("u1", { ...base, id: "a/b" }), 400);
  await rejects(store.putMedia("u1", { ...base, filename: "" }), 400);
  await rejects(store.putMedia("u1", { ...base, filename: " /\\ " }), 400);
  await rejects(store.putMedia("u1", { ...base, filename: "a".repeat(MEDIA_LIMITS.filenameMax + 1) }), 400);
  await rejects(store.putMedia("u1", { ...base, tags: ["has space"] }), 400);
  await rejects(store.putMedia("u1", { ...base, tags: [""] }), 400);
  await rejects(store.putMedia("u1", { ...base, tags: ["a".repeat(MEDIA_LIMITS.tagMax + 1)] }), 400);
  await rejects(
    store.putMedia("u1", { ...base, tags: Array.from({ length: MEDIA_LIMITS.tagsMax + 1 }, (_, i) => `t${i}`) }),
    400,
  );
  await rejects(store.putMedia("u1", { ...base, emailIds: ["bad id"] }), 400);
  await rejects(
    store.putMedia("u1", {
      ...base,
      emailIds: Array.from({ length: MEDIA_LIMITS.emailIdsMax + 1 }, (_, i) => `e${i}`),
    }),
    400,
  );
});

test("putMedia lowercases tags and keeps emailIds", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const { meta } = await store.putMedia("u1", {
    filename: "a.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg(),
    tags: ["School", "Trip-1"],
    emailIds: ["em_1"],
  });
  assert.deepEqual(meta.tags, ["school", "trip-1"]);
  assert.deepEqual(meta.emailIds, ["em_1"]);
});

test("dedupe: same id and bytes returns existing, different bytes is 409", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const first = await store.putMedia("u1", { id: "photo1", filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg("1") });
  assert.equal(first.meta.id, "photo1");
  const again = await store.putMedia("u1", { id: "photo1", filename: "other.jpg", mimeType: "image/jpeg", buffer: jpeg("1") });
  assert.equal(again.created, false);
  assert.deepEqual(again.meta, first.meta);
  await rejects(
    store.putMedia("u1", { id: "photo1", filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg("2") }),
    409,
  );
  // Default id is content-derived, so identical bytes dedupe without an id.
  const a = await store.putMedia("u1", { filename: "b.jpg", mimeType: "image/jpeg", buffer: jpeg("3") });
  const b = await store.putMedia("u1", { filename: "c.jpg", mimeType: "image/jpeg", buffer: jpeg("3") });
  assert.equal(b.created, false);
  assert.equal(a.meta.id, b.meta.id);
});

test("listMedia filters, orders newest first, paginates and reports usage", async () => {
  const { deps } = makeDeps();
  const store = createMediaStore(deps);
  const put = (n: string, extra: object = {}) =>
    store.putMedia("u1", { filename: `${n}.jpg`, mimeType: "image/jpeg", buffer: jpeg(n), ...extra });
  const a = await put("a", { tags: ["school"], emailIds: ["e1"] });
  const b = await put("b", { tags: ["family"] });
  const c = await store.putMedia("u1", { filename: "c.pdf", mimeType: "application/pdf", buffer: pdf("c"), tags: ["school"], emailIds: ["e1", "e2"] });

  const all = await store.listMedia("u1");
  assert.deepEqual(all.items.map((m) => m.id), [c.meta.id, b.meta.id, a.meta.id]);
  assert.equal(all.total, 3);
  assert.deepEqual(all.usage, { bytes: a.meta.size + b.meta.size + c.meta.size, count: 3 });

  assert.deepEqual((await store.listMedia("u1", { kind: "pdf" })).items.map((m) => m.id), [c.meta.id]);
  assert.deepEqual((await store.listMedia("u1", { tag: "SCHOOL" })).items.map((m) => m.id), [c.meta.id, a.meta.id]);
  assert.deepEqual((await store.listMedia("u1", { emailId: "e2" })).items.map((m) => m.id), [c.meta.id]);

  const page = await store.listMedia("u1", { limit: 1, offset: 1 });
  assert.deepEqual(page.items.map((m) => m.id), [b.meta.id]);
  assert.equal(page.total, 3);
  assert.equal((await store.listMedia("u1", { limit: 100000 })).items.length, 3);
});

test("quota: total bytes and item count produce 507", async () => {
  const { deps, dump } = makeDeps();
  const store = createMediaStore(deps);
  // Seed meta directly to avoid writing hundreds of MB.
  dump().media = { u1: { meta: { big: { id: "big", filename: "x", mimeType: "image/jpeg", kind: "image", size: MEDIA_LIMITS.userBytesMax - 10, sha256: "s", createdAt: "2026-01-01T00:00:00.000Z" } } } };
  await rejects(store.putMedia("u1", { filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg("0123456789") }), 507);
  // Another user is unaffected.
  await store.putMedia("u2", { filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg("0123456789") });

  const meta: Record<string, any> = {};
  for (let i = 0; i < MEDIA_LIMITS.itemsPerUserMax; i++) {
    meta[`i${i}`] = { id: `i${i}`, filename: "x", mimeType: "image/jpeg", kind: "image", size: 1, sha256: "s", createdAt: "2026-01-01T00:00:00.000Z" };
  }
  dump().media.u3 = { meta };
  await rejects(store.putMedia("u3", { filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg() }), 507);
});

test("deleteMedia removes meta and blob and frees quota", async () => {
  const { deps, dump } = makeDeps();
  const store = createMediaStore(deps);
  const { meta } = await store.putMedia("u1", { filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  assert.equal((await store.listMedia("u1")).usage.count, 1);
  assert.equal(await store.deleteMedia("u1", meta.id), true);
  assert.equal(await store.deleteMedia("u1", meta.id), false);
  assert.equal(await store.getMedia("u1", meta.id), null);
  assert.deepEqual((await store.listMedia("u1")).usage, { bytes: 0, count: 0 });
  assert.equal(dump().media.u1.blobs?.[meta.id], undefined);
});

test("media is isolated per user and never touches users/<id>", async () => {
  const { deps, dump } = makeDeps();
  const store = createMediaStore(deps);
  const { meta } = await store.putMedia("u1", { id: "shared-id", filename: "a.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  assert.equal(await store.getMedia("u2", meta.id), null);
  assert.equal(await store.deleteMedia("u2", meta.id), false);
  assert.equal((await store.listMedia("u2")).total, 0);
  // Same id for another user is independent (no 409).
  const other = await store.putMedia("u2", { id: "shared-id", filename: "b.jpg", mimeType: "image/jpeg", buffer: jpeg("different") });
  assert.equal(other.created, true);
  assert.ok(await store.getMedia("u1", "shared-id"));
  assert.deepEqual(Object.keys(dump()), ["media"]);
});
