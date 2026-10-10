import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaToPhotoItems } from "./apps/photos";
import type { MediaMeta } from "./media-store";

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
