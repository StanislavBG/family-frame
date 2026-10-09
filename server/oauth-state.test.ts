import { test } from "node:test";
import assert from "node:assert/strict";
import { createOAuthState, verifyOAuthState } from "./oauth-state";

const SECRET = "test-secret";
const NOW = 1_700_000_000_000;

test("valid round trip returns the user id", () => {
  const { state, nonce } = createOAuthState("user_1", SECRET, NOW);
  assert.deepEqual(verifyOAuthState(state, nonce, SECRET, NOW + 1000), { userId: "user_1" });
});

test("wrong or missing nonce cookie returns null", () => {
  const { state } = createOAuthState("user_1", SECRET, NOW);
  assert.equal(verifyOAuthState(state, "other-nonce", SECRET, NOW), null);
  assert.equal(verifyOAuthState(state, undefined, SECRET, NOW), null);
});

test("expired state returns null", () => {
  const { state, nonce } = createOAuthState("user_1", SECRET, NOW);
  assert.equal(verifyOAuthState(state, nonce, SECRET, NOW + 10 * 60 * 1000 + 1), null);
});

test("tampered signature or payload returns null", () => {
  const { state, nonce } = createOAuthState("user_1", SECRET, NOW);
  const [payload, sig] = state.split(".");
  const badSig = `${payload}.${sig.slice(0, -2)}${sig.endsWith("AA") ? "BB" : "AA"}`;
  assert.equal(verifyOAuthState(badSig, nonce, SECRET, NOW), null);
  const forged = Buffer.from(JSON.stringify({ userId: "victim", nonce, ts: NOW })).toString("base64url");
  assert.equal(verifyOAuthState(`${forged}.${sig}`, nonce, SECRET, NOW), null);
  assert.equal(verifyOAuthState("garbage", nonce, SECRET, NOW), null);
});

test("wrong secret returns null", () => {
  const { state, nonce } = createOAuthState("user_1", SECRET, NOW);
  assert.equal(verifyOAuthState(state, nonce, "other-secret", NOW), null);
});
