import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mediaToPhotoItems,
  resolveStreamPersonRefs,
  createHostedPhotoSource,
  PHOTO_STREAM_MAX,
} from "./photo-hosted-media";
import { MEDIA_LIMITS, type MediaMeta, type ListMediaOptions } from "./media-store";
import type { Person } from "@shared/schema";

function meta(over: Partial<MediaMeta>): MediaMeta {
  return {
    id: "a1",
    filename: "a.jpg",
    mimeType: "image/jpeg",
    kind: "image",
    size: 1,
    sha256: "x",
    tags: [],
    emailIds: [],
    personIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

test("filters pdfs and hidden items", () => {
  const out = mediaToPhotoItems([
    meta({ id: "img" }),
    meta({ id: "doc", kind: "pdf", mimeType: "application/pdf" }),
    meta({ id: "hid", tags: ["hidden"] }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["img"]);
});

test("orders newest first", () => {
  const out = mediaToPhotoItems([
    meta({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
    meta({ id: "new", createdAt: "2026-03-01T00:00:00.000Z" }),
    meta({ id: "mid", createdAt: "2026-02-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ["new", "mid", "old"]);
});

test("maps fields, encodes url, marks cached", () => {
  const [p] = mediaToPhotoItems([meta({ id: "a/b c", filename: "x.png", mimeType: "image/png" })]);
  assert.equal(p.baseUrl, "/api/files/a%2Fb%20c");
  assert.equal(p.filename, "x.png");
  assert.equal(p.mimeType, "image/png");
  assert.equal(p.creationTime, "2026-01-01T00:00:00.000Z");
  assert.equal(p.cached, true);
  assert.equal(typeof p.fetchedAt, "number");
});

function fakeStore(all: MediaMeta[]) {
  const calls: ListMediaOptions[] = [];
  return {
    calls,
    async listMedia(_userId: string, opts: ListMediaOptions = {}) {
      calls.push(opts);
      const any = opts.personIds ? new Set(opts.personIds) : null;
      const filtered = all
        .filter((m) => (opts.kind ? m.kind === opts.kind : true))
        .filter((m) => (any ? m.personIds.some((p) => any.has(p)) : true));
      const offset = opts.offset ?? 0;
      const limit = Math.min(opts.limit ?? 100, MEDIA_LIMITS.listLimitMax);
      return { items: filtered.slice(offset, offset + limit), total: filtered.length, usage: { bytes: 0, count: all.length } };
    },
  };
}

function many(n: number, over: (i: number) => Partial<MediaMeta> = () => ({})): MediaMeta[] {
  return Array.from({ length: n }, (_, i) =>
    meta({ id: `m${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(), ...over(i) }),
  );
}

const people = [
  { id: "p1", name: "Evolet" },
  { id: "p2", name: "Sam" },
] as unknown as Person[];

test("resolveStreamPersonRefs: household/undefined -> null", () => {
  assert.equal(resolveStreamPersonRefs(people, undefined, ["p1"]), null);
  assert.equal(resolveStreamPersonRefs(people, "household", ["p1"]), null);
});

test("resolveStreamPersonRefs: people -> id and name, drops unknown", () => {
  assert.deepEqual(resolveStreamPersonRefs(people, "people", ["p1", "gone"]), ["p1", "Evolet"]);
  assert.deepEqual(resolveStreamPersonRefs(people, "people", ["gone"]), []);
  assert.deepEqual(resolveStreamPersonRefs(people, "people", undefined), []);
});

test("household lists 1200 images across 3 pages", async () => {
  const store = fakeStore(many(1200));
  const out = await createHostedPhotoSource(store).listPhotos("u", null);
  assert.equal(out.length, 1200);
  assert.equal(store.calls.length, 3);
});

test("people scope matches by id and by name", async () => {
  const store = fakeStore(many(4, (i) => ({ personIds: [["p1", "Evolet", "p2", "other"][i]] })));
  const refs = resolveStreamPersonRefs(people, "people", ["p1"]);
  const out = await createHostedPhotoSource(store).listPhotos("u", refs);
  assert.deepEqual(out.map((p) => p.id).sort(), ["m0", "m1"]);
});

test("empty refs returns [] with zero store calls", async () => {
  const store = fakeStore(many(3));
  const refs = resolveStreamPersonRefs(people, "people", ["gone"]);
  assert.deepEqual(await createHostedPhotoSource(store).listPhotos("u", refs), []);
  assert.equal(store.calls.length, 0);
});

test("caps at PHOTO_STREAM_MAX", async () => {
  const store = fakeStore(many(PHOTO_STREAM_MAX + 300));
  const out = await createHostedPhotoSource(store).listPhotos("u", null);
  assert.equal(out.length, PHOTO_STREAM_MAX);
});
