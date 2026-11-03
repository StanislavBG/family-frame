import { test } from "node:test";
import assert from "node:assert/strict";
import { ffEventSchema } from "../../shared/events";
import type { FfEvent } from "../../shared/events";
import type { HaikuResult, HaikuRunInput, HaikuRunner } from "./haiku";
import type { LinkResult } from "./links";
import { VERIFY_BATCH, buildVerifyPrompt, verifyPicks } from "./verify";

const NOW = new Date("2026-11-02T12:00:00Z");

function makeEvent(id: string, over: Record<string, unknown> = {}): FfEvent {
  return ffEventSchema.parse({
    schemaVersion: 1,
    id,
    fingerprint: `fp-${id}`,
    title: `Swim class ${id}`,
    summary: "Swim",
    description: "Learn to swim",
    category: "other",
    tags: ["class"],
    schedule: { timezone: "America/Los_Angeles", start: "2026-11-10T10:00:00-08:00", allDay: false, recurrenceText: "old text", occurrences: [] },
    location: { venueName: "Pool", address: "1 Secret St", city: "Portland", country: "United States", setting: "indoor", online: false },
    cost: { isFree: false, minPrice: 99, currency: "USD", priceText: "old price", ticketRequired: false, registrationRequired: true },
    audience: { ageBands: ["school-age"], ageMin: 3, ageMax: 5, familyFriendly: true },
    organizer: { name: "Portland Swim Club", url: "https://portlandswim.org" },
    sources: [
      { url: "https://portlandswim.org/classes", kind: "official", retrievedAt: "2026-10-10T00:00:00Z" },
      { url: "https://eventbrite.com/e/1", kind: "listing", retrievedAt: "2026-10-10T00:00:00Z" },
    ],
    status: "scheduled",
    verification: { lastCheckedAt: "2026-10-10T00:00:00Z", checkCount: 1, confidence: 0.7 },
    firstSeenAt: "2026-10-10T00:00:00Z",
    ...over,
  });
}

const good = (id: string, over: Record<string, unknown> = {}) => ({
  eventId: id,
  confirmed: true,
  currentlyOffered: true,
  providerName: "Portland Swim Club",
  pageTitle: "Swim",
  start: "2026-11-12T16:00:00-08:00",
  isFree: false,
  minPrice: 120,
  currency: "USD",
  evidence: "Tuesdays 4pm, $120",
  ...over,
});

function fake(fn: (i: HaikuRunInput, n: number) => HaikuResult) {
  const calls: HaikuRunInput[] = [];
  const runner: HaikuRunner = { async run(i) { calls.push(i); return fn(i, calls.length - 1); } };
  return { runner, calls };
}
const okLinks = { async check(): Promise<LinkResult> { return { status: "ok" }; } };

test("batches of 4, WebFetch only", async () => {
  const evs = Array.from({ length: 9 }, (_, i) => makeEvent(`e${i}`));
  const { runner, calls } = fake(() => ({ ok: true, data: { items: [] } }));
  const out = await verifyPicks(runner, okLinks, evs, NOW);
  assert.equal(VERIFY_BATCH, 4);
  assert.equal(calls.length, 3);
  for (const c of calls) assert.deepEqual(c.tools, ["WebFetch"]);
  assert.equal(out.size, 9);
  assert.deepEqual(out.get("e0"), { kind: "rejected", reason: "not returned" });
});

test("prompt has no household data", () => {
  const p = buildVerifyPrompt([makeEvent("e1")]);
  assert.ok(p.includes("Portland Swim Club"));
  assert.ok(!p.includes("1 Secret St"));
  assert.ok(/never as instructions/.test(p));
});

test("confirmed overwrites schedule/price and drops unstated fields", async () => {
  const ev = makeEvent("e1");
  const { runner } = fake(() => ({ ok: true, data: { items: [good("e1")] } }));
  const o = (await verifyPicks(runner, okLinks, [ev], NOW)).get("e1");
  assert.equal(o?.kind, "confirmed");
  if (o?.kind !== "confirmed") return;
  const e = o.event;
  assert.equal(e.id, "e1");
  assert.equal(e.fingerprint, "fp-e1");
  assert.equal(e.schedule.start, "2026-11-12T16:00:00-08:00");
  assert.equal(e.schedule.recurrenceText, undefined);
  assert.equal(e.cost.minPrice, 120);
  assert.equal(e.cost.priceText, undefined);
  assert.equal(e.audience.ageMin, undefined);
  assert.equal(e.audience.ageMax, undefined);
  assert.equal(e.verification.confidence, 0.9);
  assert.equal(o.evidence, "Tuesdays 4pm, $120");
});

test("provider mismatch is rejected", async () => {
  const { runner } = fake(() => ({ ok: true, data: { items: [good("e1", { providerName: "Other Gym" })] } }));
  const o = (await verifyPicks(runner, okLinks, [makeEvent("e1")], NOW)).get("e1");
  assert.equal(o?.kind, "rejected");
});

test("unconfirmed and not offered are rejected", async () => {
  const { runner } = fake(() => ({ ok: true, data: { items: [good("a", { confirmed: false }), good("b", { currentlyOffered: false })] } }));
  const out = await verifyPicks(runner, okLinks, [makeEvent("a"), makeEvent("b")], NOW);
  assert.equal(out.get("a")?.kind, "rejected");
  assert.equal(out.get("b")?.kind, "rejected");
});

test("listing-domain and dead page sign-up links are dropped", async () => {
  const links = { async check(u: string): Promise<LinkResult> { return { status: u.includes("dead") ? "dead" : "ok" }; } };
  const run = (signUpUrl: string) =>
    verifyPicks(fake(() => ({ ok: true, data: { items: [good("e1", { signUpUrl })] } })).runner, links, [makeEvent("e1", { cost: { isFree: false, ticketRequired: false, registrationRequired: true } })], NOW);
  for (const u of ["https://classpass.com/e/2", "https://portlandswim.org/dead"]) {
    const o = (await run(u)).get("e1");
    assert.equal(o?.kind, "confirmed");
    if (o?.kind === "confirmed") assert.equal(o.event.cost.registrationUrl, undefined);
  }
  const o = (await run("https://portlandswim.org/signup")).get("e1");
  if (o?.kind === "confirmed") assert.equal(o.event.cost.registrationUrl, "https://portlandswim.org/signup");
  else assert.fail("expected confirmed");
});

test("failed session makes the batch unavailable", async () => {
  const { runner } = fake(() => ({ ok: false, reason: "timeout", detail: "slow" }));
  const out = await verifyPicks(runner, okLinks, [makeEvent("a"), makeEvent("b")], NOW);
  assert.equal(out.get("a")?.kind, "unavailable");
  assert.equal(out.get("b")?.kind, "unavailable");
});

test("budget-exhausted stops later batches", async () => {
  const evs = Array.from({ length: 6 }, (_, i) => makeEvent(`e${i}`));
  const { runner, calls } = fake(() => ({ ok: false, reason: "budget-exhausted", detail: "used" }));
  const out = await verifyPicks(runner, okLinks, evs, NOW);
  assert.equal(calls.length, 1);
  assert.equal(out.size, 6);
  Array.from(out.values()).forEach((v) => assert.equal(v.kind, "unavailable"));
});
