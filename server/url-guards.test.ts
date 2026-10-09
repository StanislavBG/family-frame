import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedGooglePhotoUrl } from "./url-guards";

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
