import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// bilko.run hosts the card media at /projects/family-frame/_media/<sha256>.<ext>, and
// bilko.listing.json mirrors those paths. A file in bilko-card/ changed without a new
// set_listing_media call (or a hand-edited path) fails here. See docs/bilko-run.md section 3.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function hostedPath(rel: string): string {
  const sha256 = createHash("sha256").update(readFileSync(path.join(repoRoot, rel))).digest("hex");
  return `/projects/family-frame/_media/${sha256}${path.extname(rel)}`;
}

const listing = JSON.parse(readFileSync(path.join(repoRoot, "bilko.listing.json"), "utf8")).listing as Record<
  string,
  unknown
>;

test("bilko.listing.json listing.video is the hosted path of bilko-card/tile.mp4", () => {
  assert.equal(listing.video, hostedPath("bilko-card/tile.mp4"));
});

test("bilko.listing.json listing.shareImage is the hosted path of bilko-card/og.png", () => {
  assert.equal(listing.shareImage, hostedPath("bilko-card/og.png"));
});
