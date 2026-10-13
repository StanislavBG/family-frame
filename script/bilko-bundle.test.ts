import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { gzipSync } from "zlib";
import { buildBilkoBundle, buildManifest, pngSize, renderRedirectPage } from "./bilko-bundle";

const TARGET = "https://family-frame.replit.app/";

test("redirect meta, canonical and link all point at the target", () => {
  const html = renderRedirectPage(TARGET);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Family Frame<\/title>/);
  assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${TARGET}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${TARGET}">`));
  assert.ok(html.includes(`<a href="${TARGET}">Open Family Frame</a>`));
  assert.ok(html.includes("<h1>Family Frame</h1>"));
  assert.ok(!html.includes("<script"));
  assert.ok(!/og:|twitter:/.test(html));
});

test("target is attribute-escaped", () => {
  const html = renderRedirectPage('https://example.com/?a="x"&b=1');
  assert.ok(html.includes("?a=&quot;x&quot;&amp;b=1"));
  assert.ok(!html.includes('a="x"'));
});

test("non-https targets throw", () => {
  assert.throws(() => renderRedirectPage("http://localhost:5000/"));
  assert.throws(() => renderRedirectPage(""));
});

test("manifest fields and bundle sizes", () => {
  const files = [{ name: "index.html", content: renderRedirectPage(TARGET) }];
  const m = buildManifest({ version: "1.2.3", builtAt: "2026-01-01T00:00:00.000Z", gitSha: "abc1234", gitBranch: "main", files });
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.slug, "family-frame");
  assert.deepEqual(m.golden, { path: "/projects/family-frame/", expect: "Family Frame" });
  assert.deepEqual(m.hostKit, { version: "0.0.0" });
  assert.deepEqual(m.health, {});
  assert.equal(m.bundle.fileCount, 1);
  assert.equal(m.bundle.sizeBytesGz, gzipSync(files[0].content).length);
});

test("buildBilkoBundle writes exactly index.html, og.png, icon.png and manifest.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bilko-bundle-"));
  try {
    const out = path.join(dir, "dist");
    buildBilkoBundle(out, TARGET);
    assert.deepEqual(readdirSync(out).sort(), ["icon.png", "index.html", "manifest.json", "og.png"]);
    const manifest = JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8"));
    const written = ["index.html", "og.png", "icon.png"].map((n) => readFileSync(path.join(out, n)));
    assert.equal(manifest.bundle.fileCount, 3);
    assert.equal(manifest.bundle.sizeBytesGz, written.reduce((sum, b) => sum + gzipSync(b).length, 0));
    assert.ok(readFileSync(path.join(out, "manifest.json")).length < 16 * 1024);

    const og = readFileSync(path.join(out, "og.png"));
    assert.deepEqual(pngSize(og), { width: 1200, height: 630 });
    assert.ok(og.length <= 5 * 1024 * 1024);

    const icon = readFileSync(path.join(out, "icon.png"));
    const { width, height } = pngSize(icon);
    assert.equal(width, height);
    assert.ok(width >= 128 && width <= 1024);
    assert.ok(icon.length <= 512 * 1024);

    const totalGz = readdirSync(out).reduce((sum, n) => sum + gzipSync(readFileSync(path.join(out, n))).length, 0);
    assert.ok(totalGz < 204800);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
