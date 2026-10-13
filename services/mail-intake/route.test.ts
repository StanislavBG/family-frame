import { test } from "node:test";
import assert from "node:assert/strict";
import { routeMessage } from "./route";
import type { GmailMessage } from "./gmail";

const BASE = "family@gmail.com";
const KEY = "abcd234567";

function msg(headers: Record<string, string | string[]>, over: Partial<GmailMessage> = {}): GmailMessage {
  const map = new Map<string, string[]>();
  for (const [k, v] of Object.entries(headers)) map.set(k.toLowerCase(), Array.isArray(v) ? v : [v]);
  return {
    id: "18c0ffee",
    threadId: "t1",
    internalDate: "2026-10-13T12:00:00.000Z",
    headers: map,
    text: "Hello there",
    ...over,
  };
}

function deliver(r: ReturnType<typeof routeMessage>) {
  assert.equal(r.kind, "deliver");
  if (r.kind !== "deliver") throw new Error("unreachable");
  return r.body;
}

test("household tag", () => {
  const body = deliver(
    routeMessage(
      msg({
        "Delivered-To": `family+${KEY}@gmail.com`,
        From: '"Aunt Ann" <ann@example.com>',
        Subject: "Hi",
      }),
      BASE,
    ),
  );
  assert.equal(body.key, KEY);
  assert.equal(body.personSlug, undefined);
  assert.equal(body.source, "ann@example.com");
  assert.equal(body.authenticated, false);
  assert.deepEqual(body.message, {
    id: "18c0ffee",
    receivedAt: "2026-10-13T12:00:00.000Z",
    from: { name: "Aunt Ann", email: "ann@example.com" },
    subject: "Hi",
    text: "Hello there",
  });
});

test("tag with person slug, first matching Delivered-To wins", () => {
  const body = deliver(
    routeMessage(
      msg({
        "Delivered-To": ["other@example.com", `family+${KEY}-mia@gmail.com`, "family+zzzzzzzzzz@gmail.com"],
        From: "bob@example.com",
      }),
      BASE,
    ),
  );
  assert.equal(body.key, KEY);
  assert.equal(body.personSlug, "mia");
  assert.equal(body.message?.from.name, undefined);
  assert.equal(body.message?.subject, "");
});

test("wrong base is skipped", () => {
  const r = routeMessage(msg({ "Delivered-To": `family+${KEY}@gmail.com`, From: "a@b.com" }), "someone@gmail.com");
  assert.deepEqual(r, { kind: "skip", reason: "no-household-tag" });
});

test("forwarded mail with X-Forwarded-For and dkim pass", () => {
  const body = deliver(
    routeMessage(
      msg({
        "Delivered-To": `family+${KEY}@gmail.com`,
        From: "Brother <Brother@Example.com>",
        "X-Forwarded-For": "Brother@Example.com family@gmail.com",
        "Authentication-Results": "mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=fail smtp.mailfrom=x@y.com",
      }),
      BASE,
    ),
  );
  assert.equal(body.source, "brother@example.com");
  assert.equal(body.authenticated, true);
});

test("direct mail with spf pass", () => {
  const body = deliver(
    routeMessage(
      msg({
        "Delivered-To": `family+${KEY}@gmail.com`,
        From: "ann@example.com",
        "Authentication-Results": "mx.google.com; spf=pass (google.com: domain of ann@example.com) smtp.mailfrom=ann@example.com",
      }),
      BASE,
    ),
  );
  assert.equal(body.authenticated, true);
});

test("spoofed X-Forwarded-For without auth is not authenticated", () => {
  const body = deliver(
    routeMessage(
      msg({
        "Delivered-To": `family+${KEY}@gmail.com`,
        From: "evil@attacker.com",
        "X-Forwarded-For": "trusted@example.com family@gmail.com",
        "Authentication-Results": "mx.google.com; dkim=pass header.d=attacker.com; spf=pass smtp.mailfrom=evil@attacker.com",
      }),
      BASE,
    ),
  );
  assert.equal(body.source, "trusted@example.com");
  assert.equal(body.authenticated, false);
});

const CONFIRM_URL = "https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc";

test("confirmation email parsed", () => {
  const body = deliver(
    routeMessage(
      msg(
        {
          "Delivered-To": `family+${KEY}@gmail.com`,
          From: "Gmail Team <forwarding-noreply@google.com>",
          Subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from brother@gmail.com",
        },
        {
          text: `brother@gmail.com has requested to automatically forward mail to family@gmail.com.\n\nClick the link below to confirm the request:\n\n${CONFIRM_URL}\n\nThanks`,
        },
      ),
      BASE,
    ),
  );
  assert.equal(body.message, undefined);
  assert.deepEqual(body.verification, { requester: "brother@gmail.com", confirmUrl: CONFIRM_URL });
});

test("confirmation with a non-Google link is skipped", () => {
  const r = routeMessage(
    msg(
      {
        "Delivered-To": `family+${KEY}@gmail.com`,
        From: "forwarding-noreply@google.com",
        Subject: "(#1) Gmail Forwarding Confirmation - Receive Mail from brother@gmail.com",
      },
      { text: "Confirm: https://evil.example.com/mail/vf-abc" },
    ),
    BASE,
  );
  assert.deepEqual(r, { kind: "skip", reason: "bad-confirmation" });
});
