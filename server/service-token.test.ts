import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { SERVICE_TOKEN_PREFIX, verifyServiceToken } from "./service-token";

const token = SERVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");

test("prefix constant", () => {
  assert.equal(SERVICE_TOKEN_PREFIX, "ff_svc_");
});

test("valid token verifies against its hash (case-insensitive, trimmed)", () => {
  assert.equal(verifyServiceToken(token, hash), true);
  assert.equal(verifyServiceToken(token, ` ${hash.toUpperCase()}\n`), true);
});

test("unset, blank or malformed env hash never verifies", () => {
  assert.equal(verifyServiceToken(token, undefined), false);
  assert.equal(verifyServiceToken(token, ""), false);
  assert.equal(verifyServiceToken(token, "   "), false);
  assert.equal(verifyServiceToken(token, "abc123"), false);
  assert.equal(verifyServiceToken(token, "z".repeat(64)), false);
  assert.equal(verifyServiceToken(token, hash + "00"), false);
});

test("wrong token, wrong prefix or malformed body is rejected", () => {
  const other = SERVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  assert.equal(verifyServiceToken(other, hash), false);
  const body = token.slice(SERVICE_TOKEN_PREFIX.length);
  const noPrefix = createHash("sha256").update(body).digest("hex");
  assert.equal(verifyServiceToken(body, noPrefix), false);
  const short = SERVICE_TOKEN_PREFIX + body.slice(1);
  assert.equal(verifyServiceToken(short, createHash("sha256").update(short).digest("hex")), false);
  const long = token + "a";
  assert.equal(verifyServiceToken(long, createHash("sha256").update(long).digest("hex")), false);
  assert.equal(verifyServiceToken("", hash), false);
});
