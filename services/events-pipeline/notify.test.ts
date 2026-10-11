import { test } from "node:test";
import assert from "node:assert/strict";
import { openEventsDb } from "./db";
import {
  loadJobState,
  planNotices,
  saveJobState,
  sendNotice,
  type JobState,
  type Notice,
} from "./notify";

const NOW = "2026-10-10T12:00:00.000Z";
const failing = (over: Partial<JobState> = {}): JobState => ({
  failing: true,
  lastError: "boom",
  since: "2026-10-10T10:00:00.000Z",
  notifiedAt: "2026-10-10T10:00:00.000Z",
  ...over,
});

test("(a) first failure -> one critical notice with job and error", () => {
  const { notices, next } = planNotices("watch", null, { ok: false, error: "boom" }, NOW);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].urgency, "critical");
  assert.match(notices[0].title + notices[0].body, /watch/);
  assert.match(notices[0].body, /boom/);
  assert.deepEqual(next, { failing: true, lastError: "boom", since: NOW, notifiedAt: NOW });
});

test("(a) changed error message while failing -> new critical notice, since kept", () => {
  const prev = failing();
  const { notices, next } = planNotices("watch", prev, { ok: false, error: "other" }, NOW);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].urgency, "critical");
  assert.match(notices[0].body, /other/);
  assert.equal(next.since, prev.since);
  assert.equal(next.lastError, "other");
  assert.equal(next.notifiedAt, NOW);
});

test("(b) same error within 24h -> silent, notifiedAt unchanged", () => {
  const prev = failing();
  const { notices, next } = planNotices("watch", prev, { ok: false, error: "boom" }, NOW);
  assert.deepEqual(notices, []);
  assert.deepEqual(next, prev);
});

test("(b) 24h reminder boundary", () => {
  const notifiedAt = "2026-10-09T12:00:00.000Z";
  const just = planNotices("all", failing({ notifiedAt }), { ok: false, error: "boom" }, "2026-10-10T11:59:59.999Z");
  assert.equal(just.notices.length, 0);
  const at = planNotices("all", failing({ notifiedAt }), { ok: false, error: "boom" }, NOW);
  assert.equal(at.notices.length, 1);
  assert.equal(at.notices[0].urgency, "critical");
  assert.equal(at.next.notifiedAt, NOW);
});

test("(c) failing -> ok sends one normal recovered notice and clears state", () => {
  const { notices, next } = planNotices("refresh", failing(), { ok: true }, NOW);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].urgency, "normal");
  assert.match(notices[0].title + notices[0].body, /recovered/i);
  assert.deepEqual(next, { failing: false, lastError: null, since: null, notifiedAt: null });
});

test("(d) each household run -> one normal notice; errored run -> critical", () => {
  const id = "abcdef1234567890";
  const { notices } = planNotices(
    "watch",
    null,
    {
      ok: true,
      householdRuns: [
        { householdId: id, reason: "first-discovery", published: 3, candidates: 12, costUsd: 0.04 },
        { householdId: "zzzzzzzz9999", reason: "address-changed", published: 0, candidates: 0, error: "geocode failed" },
      ],
    },
    NOW,
  );
  assert.equal(notices.length, 2);
  const [ok, bad] = notices;
  assert.equal(ok.urgency, "normal");
  const text = ok.title + " " + ok.body;
  assert.ok(text.includes("abcdef12"));
  assert.ok(!text.includes("abcdef123"));
  assert.ok(text.includes("first-discovery"));
  assert.ok(text.includes("3") && text.includes("12"));
  assert.equal(bad.urgency, "critical");
  assert.ok((bad.title + bad.body).includes("geocode failed"));
});

test("(e) job all ok with summary -> one low notice", () => {
  const { notices } = planNotices(
    "all",
    null,
    { ok: true, summary: { published: 5, candidates: 20, errors: 1, costUsd: 0.2 } },
    NOW,
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].urgency, "low");
});

test("(e) summary on a non-all job is ignored", () => {
  const { notices } = planNotices(
    "discover",
    null,
    { ok: true, summary: { published: 5, candidates: 20, errors: 0 } },
    NOW,
  );
  assert.deepEqual(notices, []);
});

test("(f) idle watch -> no notice", () => {
  const { notices, next } = planNotices("watch", null, { ok: true }, NOW);
  assert.deepEqual(notices, []);
  assert.equal(next.failing, false);
  const empty = planNotices("watch", null, { ok: true, householdRuns: [] }, NOW);
  assert.deepEqual(empty.notices, []);
});

test("load/save round-trip on :memory: db", () => {
  const db = openEventsDb(":memory:");
  assert.equal(loadJobState(db, "watch"), null);
  const s = failing();
  saveJobState(db, "watch", s);
  assert.deepEqual(loadJobState(db, "watch"), s);
  const cleared: JobState = { failing: false, lastError: null, since: null, notifiedAt: null };
  saveJobState(db, "watch", cleared);
  assert.deepEqual(loadJobState(db, "watch"), cleared);
  assert.equal(loadJobState(db, "all"), null);
  db.close();
});

test("sendNotice runs notify-send with the expected argv and 5s timeout", () => {
  const calls: { cmd: string; args: string[]; timeout?: number }[] = [];
  const n: Notice = { title: "T", body: "B", urgency: "critical" };
  sendNotice(n, {
    env: {},
    spawn: (cmd, args, opts) => {
      calls.push({ cmd, args, timeout: opts.timeout });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "notify-send");
  assert.deepEqual(calls[0].args, ['--app-name=Family Frame events', "-u", "critical", "T", "B"]);
  assert.equal(calls[0].timeout, 5000);
});

test("sendNotice swallows spawn errors", () => {
  assert.doesNotThrow(() =>
    sendNotice(
      { title: "T", body: "B", urgency: "low" },
      {
        env: {},
        spawn: () => {
          throw new Error("ENOENT");
        },
      },
    ),
  );
});

test("sendNotice does nothing when EVENTS_NOTIFY=off", () => {
  let called = false;
  sendNotice(
    { title: "T", body: "B", urgency: "normal" },
    { env: { EVENTS_NOTIFY: "off" }, spawn: () => { called = true; } },
  );
  assert.equal(called, false);
});
