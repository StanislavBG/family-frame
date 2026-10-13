import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INBOX_KEY_PATTERN,
  generateInboxKey,
  personSlug,
  buildInboxAddress,
  parseInboxTag,
  isGmailConfirmUrl,
  inboxSourceSchema,
  deliverRequestSchema,
} from "../shared/household-inbox";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function fakeRandom(n: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
}

test("generateInboxKey: length, charset, pattern", () => {
  const key = generateInboxKey(fakeRandom);
  assert.equal(key.length, 10);
  for (const c of key) assert.ok(ALPHABET.includes(c));
  assert.match(key, INBOX_KEY_PATTERN);
  const all = generateInboxKey((n) => new Uint8Array(n).fill(255));
  assert.match(all, INBOX_KEY_PATTERN);
});

test("personSlug normalises names", () => {
  assert.equal(personSlug("Évolet Ana"), "evoletana");
  assert.equal(personSlug("  !!! "), "");
  assert.equal(personSlug("A".repeat(30)), "a".repeat(20));
  assert.equal(personSlug("Zoë-Marie 2"), "zoemarie2");
});

test("build/parse round trip", () => {
  const base = "inbox@example.com";
  assert.equal(buildInboxAddress(base, "abcdefghij"), "inbox+abcdefghij@example.com");
  assert.equal(buildInboxAddress(base, "abcdefghij", "ana"), "inbox+abcdefghij-ana@example.com");
  assert.deepEqual(parseInboxTag("inbox+abcdefghij@example.com", base), { key: "abcdefghij" });
  assert.deepEqual(parseInboxTag("inbox+abcdefghij-ana@example.com", base), {
    key: "abcdefghij",
    personSlug: "ana",
  });
  assert.deepEqual(parseInboxTag("INBOX+ABCDEFGHIJ-Ana@Example.COM", base), {
    key: "abcdefghij",
    personSlug: "ana",
  });
});

test("dotted gmail base", () => {
  const base = "my.family.inbox@gmail.com";
  const addr = buildInboxAddress(base, "abcdefghij", "ana");
  assert.deepEqual(parseInboxTag(addr, base), { key: "abcdefghij", personSlug: "ana" });
  assert.deepEqual(parseInboxTag("myfamilyinbox+abcdefghij@gmail.com", base), { key: "abcdefghij" });
  assert.deepEqual(parseInboxTag("my.family.inbox+abcdefghij@googlemail.com", "myfamilyinbox@googlemail.com"), {
    key: "abcdefghij",
  });
  // dots are significant for non-gmail bases
  assert.equal(parseInboxTag("inbox+abcdefghij@example.com", "in.box@example.com"), null);
});

test("wrong base, missing tag, bad key -> null", () => {
  const base = "inbox@example.com";
  assert.equal(parseInboxTag("other+abcdefghij@example.com", base), null);
  assert.equal(parseInboxTag("inbox+abcdefghij@other.com", base), null);
  assert.equal(parseInboxTag("inbox@example.com", base), null);
  assert.equal(parseInboxTag("inbox+@example.com", base), null);
  assert.equal(parseInboxTag("inbox+short@example.com", base), null);
  assert.equal(parseInboxTag("inbox+abcdefghijk@example.com", base), null);
  assert.equal(parseInboxTag("inbox+abcdefgh!j@example.com", base), null);
  assert.equal(parseInboxTag("not an address", base), null);
});

test("isGmailConfirmUrl allowlist", () => {
  assert.equal(isGmailConfirmUrl("https://mail-settings.google.com/mail/vf-abc"), true);
  assert.equal(isGmailConfirmUrl("https://mail.google.com/mail/vf-abc?x=1"), true);
  assert.equal(isGmailConfirmUrl("http://mail.google.com/mail/vf-abc"), false);
  assert.equal(isGmailConfirmUrl("https://mail.google.com.evil.com/x"), false);
  assert.equal(isGmailConfirmUrl("https://evilmail.google.com/x"), false);
  assert.equal(isGmailConfirmUrl("https://mail.google.com@evil.com/x"), false);
  assert.equal(isGmailConfirmUrl("https://google.com/x"), false);
  assert.equal(isGmailConfirmUrl("not a url"), false);
});

test("inboxSourceSchema", () => {
  const ok = { email: "a@b.com", status: "pending", firstSeenAt: "2026-10-13T00:00:00Z" };
  assert.equal(inboxSourceSchema.safeParse(ok).success, true);
  assert.equal(
    inboxSourceSchema.safeParse({ ...ok, verifyUrl: "https://mail.google.com/x", verifyRequestedAt: "2026-10-13T00:00:00Z" })
      .success,
    true,
  );
  assert.equal(inboxSourceSchema.safeParse({ ...ok, status: "nope" }).success, false);
  assert.equal(inboxSourceSchema.safeParse({ ...ok, email: "bad" }).success, false);
});

const message = {
  id: "msg_1-A",
  receivedAt: "2026-10-13T10:00:00+00:00",
  from: { name: "Ana", email: "ana@example.com" },
  subject: "Hello",
  text: "Body",
};
const base = { key: "abcdefghij", source: "Ana@Example.com", authenticated: true };

test("deliverRequestSchema accepts message and verification", () => {
  const m = deliverRequestSchema.parse({ ...base, personSlug: "ana", message });
  assert.equal(m.source, "ana@example.com");
  const v = deliverRequestSchema.safeParse({
    ...base,
    verification: { requester: "me@gmail.com", confirmUrl: "https://mail.google.com/mail/vf-1" },
  });
  assert.equal(v.success, true);
});

test("deliverRequestSchema rejects bad input", () => {
  const bad = (x: unknown) => assert.equal(deliverRequestSchema.safeParse(x).success, false);
  bad({ ...base }); // neither
  bad({
    ...base,
    message,
    verification: { requester: "me@gmail.com", confirmUrl: "https://mail.google.com/x" },
  }); // both
  bad({ ...base, key: "short", message });
  bad({ ...base, personSlug: "Bad-Slug", message });
  bad({ ...base, personSlug: "a".repeat(21), message });
  bad({ ...base, message: { ...message, receivedAt: "2026-10-13T10:00:00" } }); // no offset
  bad({ ...base, message: { ...message, id: "bad id" } });
  bad({ ...base, message: { ...message, subject: "x".repeat(1001) } });
  bad({ ...base, message: { ...message, text: "x".repeat(200_001) } });
  bad({ ...base, message, extra: 1 });
  bad({
    ...base,
    verification: { requester: "me@gmail.com", confirmUrl: "http://mail.google.com/x" },
  });
  bad({
    ...base,
    verification: { requester: "me@gmail.com", confirmUrl: "https://evil.com/x" },
  });
});
