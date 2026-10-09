import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedGooglePhotoUrl, isAllowedStreamUrl } from "./url-guards";

test("allows https googleusercontent hosts", () => {
  for (const u of [
    "https://lh3.googleusercontent.com/abc=w1920-h1080",
    "https://googleusercontent.com/x",
    "https://photos.fife.usercontent.googleusercontent.com/p/1",
  ]) {
    assert.equal(isAllowedGooglePhotoUrl(u), true, u);
  }
});

test("denies everything else", () => {
  for (const u of [
    "http://lh3.googleusercontent.com/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://169.254.169.254/latest",
    "https://lh3.googleusercontent.com@evil.com/a",
    "https://lh3.googleusercontent.com:pw@lh3.googleusercontent.com/a",
    "https://googleusercontent.com.evil.com/a",
    "https://evilgoogleusercontent.com/a",
    "https://example.com/a",
    "ftp://lh3.googleusercontent.com/a",
    "not a url",
    "",
    "//lh3.googleusercontent.com/a",
  ]) {
    assert.equal(isAllowedGooglePhotoUrl(u), false, u);
  }
});

const HOSTS = ["bnr.bg", "somafm.com"] as const;

test("isAllowedStreamUrl allows http(s) allowlisted hosts and subdomains", () => {
  for (const u of [
    "https://bnr.bg/x",
    "http://stream.bnr.bg/live",
    "https://ICE1.SomaFM.com/dronezone-128-mp3",
    "https://stream.bnr.bg:8443/a.m3u8",
  ]) {
    assert.equal(isAllowedStreamUrl(u, HOSTS), true, u);
  }
});

test("isAllowedStreamUrl denies everything else", () => {
  for (const u of [
    "ftp://bnr.bg/a",
    "file:///etc/passwd",
    "https://127.0.0.1/a",
    "http://169.254.169.254/latest",
    "https://[::1]/a",
    "https://user:pw@bnr.bg/a",
    "https://bnr.bg@evil.com/a",
    "https://bnr.bg.evil.com/a",
    "https://evilbnr.bg/a",
    "https://example.com/a",
    "not a url",
    "",
  ]) {
    assert.equal(isAllowedStreamUrl(u, HOSTS), false, u);
  }
  assert.equal(isAllowedStreamUrl("https://bnr.bg/a", []), false);
});
