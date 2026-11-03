import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPreferencesSchema, type RecommendationInput } from "../../shared/events";
import { getOfficialCheck, listRejectedEventIds, listHouseholds, listRecommendationsForHousehold, openEventsDb, upsertHousehold, recordRecommendation } from "./db";
import { runDiscover } from "./discover";
import type { FfClient, FfHousehold, FfState } from "./ff-client";
import type { HaikuResult, HaikuRunner } from "./haiku";
import { areaKey } from "./geo";
import type { LinkStatus } from "./links";
import { upsertEvent } from "./db";
import { normalizeCandidate } from "./normalize";

const now = new Date("2026-10-10T12:00:00Z");
const address = { line1: "1 Main St", city: "Portland", region: "OR", country: "United States", timezone: "America/Los_Angeles" };

const candidate = {
  title: "Riverside Family Pumpkin Festival",
  description: "Pumpkin patch, hayrides and a costume parade.",
  start: "2026-10-17T10:00:00-07:00",
  city: "Portland",
  country: "United States",
  category: "kids-activities",
  organizerName: "Riverside Farm",
  organizerUrl: "https://riversidefarm.example/",
  officialUrl: "https://riversidefarm.example/festival",
  sourceUrls: ["https://riversidefarm.example/festival"],
};

function household(id: string): FfHousehold {
  return {
    householdId: id,
    address,
    timezone: "America/Los_Angeles",
    memberAges: [38, 36, 5],
    preferences: eventPreferencesSchema.parse({}),
    learned: {},
    lastPublishedAt: null,
    consentVersion: 1,
  };
}

function state(id: string, over: Partial<FfState> = {}): FfState {
  return { householdId: id, recommendations: [], busy: [], feedback: [], preferences: eventPreferencesSchema.parse({}), learned: {}, ...over };
}

interface Fake {
  ff: Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations" | "recordRun">;
  calls: string[];
  puts: RecommendationInput[];
}

function fakeFf(households: FfHousehold[], states: Record<string, FfState>, calls: string[] = []): Fake {
  const puts: RecommendationInput[] = [];
  return {
    calls,
    puts,
    ff: {
      listHouseholds: async () => households,
      getState: async (id) => {
        calls.push(`state:${id}`);
        return states[id] ?? state(id);
      },
      putRecommendations: async (id, body) => {
        calls.push(`put:${id}`);
        puts.push(...body.recommendations);
        return { created: body.recommendations.length, updated: 0, unchanged: 0, ids: [], changed: [] };
      },
      recordRun: async () => {
        calls.push("recordRun");
        return { lastRunId: "r", lastPublishedAt: now.toISOString(), lastRun: null };
      },
    },
  };
}

function fakeRunner(searchResult: () => HaikuResult, calls: string[] = []): HaikuRunner {
  return {
    run: async (input) => {
      if (input.prompt.startsWith("Find real")) {
        calls.push("search");
        return searchResult();
      }
      return { ok: false, reason: "failed", detail: "no explain in tests" };
    },
  };
}

/** Search results as given; official page checks confirm each event as it was claimed. */
function confirmingRunner(searchResult: () => HaikuResult): HaikuRunner {
  return {
    run: async (input) => {
      if (input.prompt.startsWith("Find real")) return searchResult();
      if (input.prompt.startsWith("You check whether")) {
        const evs = JSON.parse(input.prompt.slice(input.prompt.lastIndexOf("\nEvents:\n") + 9)) as {
          eventId: string;
          claimedSchedule: { start: string; end?: string };
        }[];
        return {
          ok: true,
          data: {
            items: evs.map((e) => ({
              eventId: e.eventId,
              confirmed: true,
              currentlyOffered: true,
              providerName: "Riverside Farm",
              start: e.claimedSchedule.start,
              ...(e.claimedSchedule.end ? { end: e.claimedSchedule.end } : {}),
              evidence: "page",
            })),
          },
        };
      }
      return { ok: false, reason: "failed", detail: "no explain in tests" };
    },
  };
}

const found = (...c: unknown[]) => (): HaikuResult => ({ ok: true, data: { candidates: c } });
const geocoder = { geocode: async () => ({ lat: 45.5, lon: -122.6 }) };
const limits = { maxTasksPerArea: 1 };

const zeroStats = { ok: 0, dead: 0, moved: 0, blocked: 0, refused: 0, error: 0 };
function fakeLinks(statusFor: (url: string) => LinkStatus = () => "ok") {
  const urls: string[] = [];
  const counts = { ...zeroStats };
  return {
    urls,
    check: async (url: string) => {
      urls.push(url);
      const status = statusFor(url);
      counts[status] += 1;
      return { status };
    },
    stats: () => ({ ...counts }),
  };
}
const okLinks = fakeLinks();

function run(over: Partial<Parameters<typeof runDiscover>[0]> & Pick<Parameters<typeof runDiscover>[0], "ff" | "runner">) {
  return runDiscover({ db: openEventsDb(":memory:"), links: okLinks, geocoder, now, runId: "run1", limits, ...over });
}

test("revoked household is purged with its recommendations", async () => {
  const db = openEventsDb(":memory:");
  upsertHousehold(db, { id: "gone", address, addressHash: "x", lat: 1, lon: 2, areaKey: areaKey(address), profile: null, updatedAt: "t" });
  recordRecommendation(db, { householdId: "gone", eventId: "e1", publishedAt: "t", publishedHash: "h" });
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found()) });
  assert.equal(stats.purged, 1);
  assert.deepEqual(listHouseholds(db).map((h) => h.id), ["h1"]);
  assert.equal(listRecommendationsForHousehold(db, "gone").length, 0);
});

test("state is read before any search", async () => {
  const calls: string[] = [];
  const f = fakeFf([household("h1")], {}, calls);
  await run({ ff: f.ff, runner: fakeRunner(found(candidate), calls) });
  assert.ok(calls.indexOf("state:h1") >= 0 && calls.indexOf("state:h1") < calls.indexOf("search"), calls.join(","));
});

test("new candidate is published and recorded locally", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.newEvents, 1);
  assert.equal(stats.published, 1);
  assert.equal(f.puts.length, 1);
  assert.equal(listRecommendationsForHousehold(db, "h1").length, 1);
  assert.equal(stats.closeToHome, 1);
});

test("duplicate candidate is merged and not re-published", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const runner = fakeRunner(found(candidate, { ...candidate, title: "Riverside Family Pumpkin Festival!", sourceUrls: ["https://other.example/p"] }));
  const first = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r1", limits, ff: f.ff, runner });
  assert.equal(first.newEvents, 1);
  assert.equal(first.merged, 1);
  assert.equal(first.published, 1);
  const second = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r2", limits: { ...limits, maxTasksPerArea: 3 }, ff: f.ff, runner });
  assert.equal(second.newEvents, 0);
  assert.equal(second.published, 0);
  assert.equal(f.puts.length, 1);
});

test("event clashing with a busy interval is skipped", async () => {
  const busy = [{ start: "2026-10-17T09:00:00-07:00", end: "2026-10-17T14:00:00-07:00" }];
  const f = fakeFf([household("h1")], { h1: state("h1", { busy }) });
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.published, 0);
  assert.ok(stats.skipped >= 1);
  assert.equal(f.puts.length, 0);
});

test("dryRun makes no ff writes", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r", limits, dryRun: true, ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.published, 1);
  assert.equal(f.calls.some((c) => c.startsWith("put:") || c === "recordRun"), false);
  assert.equal(listRecommendationsForHousehold(db, "h1").length, 0);
});

test("rate limit stops searching but still publishes from the repository", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  await runDiscover({ db, links: okLinks, geocoder, now, runId: "r1", limits, dryRun: true, ff: f.ff, runner: fakeRunner(found(candidate)) });
  const limited = fakeRunner(() => ({ ok: false, reason: "rate-limited", detail: "429" }));
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r2", limits, ff: f.ff, runner: limited });
  assert.equal(stats.searches, 1);
  assert.equal(stats.published, 1);
  assert.equal(f.puts.length, 1);
});

test("one household's failure does not stop the others", async () => {
  const f = fakeFf([household("bad"), household("h2")], {});
  const base = f.ff.getState;
  f.ff.getState = async (id) => {
    if (id === "bad") throw new Error("boom");
    return base(id);
  };
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.errors, 1);
  assert.equal(stats.published, 1);
});

test("household is marked discovered after a successful pass, also in dry-run", async () => {
  for (const dryRun of [false, true]) {
    const db = openEventsDb(":memory:");
    const f = fakeFf([household("h1")], {});
    await runDiscover({ db, links: okLinks, geocoder, now, runId: "r", limits, dryRun, ff: f.ff, runner: fakeRunner(found(candidate)) });
    assert.equal(listHouseholds(db)[0].lastDiscoveredAt, now.toISOString());
  }
});

test("funnel stats: normalize rejects, search failures, skip reasons and phase timings", async () => {
  const busy = [{ start: "2026-10-17T09:00:00-07:00", end: "2026-10-17T14:00:00-07:00" }];
  const f = fakeFf([household("h1")], { h1: state("h1", { busy }) });
  let n = 0;
  const runner = fakeRunner(() => {
    n += 1;
    if (n === 2) return { ok: false, reason: "failed", detail: "boom" };
    return { ok: true, data: { candidates: [candidate, { ...candidate, title: "Second Festival", sourceUrls: ["https://b.example/x"] }, { ...candidate, start: "not a date" }] } };
  });
  let tick = 0;
  const stats = await run({ ff: f.ff, runner, limits: { maxTasksPerArea: 2 }, clock: () => (tick += 10) });
  assert.equal(stats.candidates, 3);
  assert.equal(stats.normalizeRejected, 1);
  assert.equal(Object.values(stats.normalizeRejectReasons).reduce((a, b) => a + b, 0), 1);
  assert.equal(stats.searchFailures.failed, 1);
  assert.ok(stats.skipped >= 1);
  assert.equal(Object.values(stats.skippedByReason).reduce((a, b) => a + b, 0), stats.skipped);
  assert.equal(stats.ranked, 0);
  assert.deepEqual(Object.keys(stats.phaseMs).sort(), ["explain", "prepare", "publish", "rank", "search"]);
  for (const v of Object.values(stats.phaseMs)) assert.ok(Number.isInteger(v) && v >= 0 && v % 10 === 0);
  assert.ok(stats.phaseMs.prepare > 0 && stats.phaseMs.search > 0);
});

test("schema-invalid search results are counted in invalidCandidates", async () => {
  const f = fakeFf([household("h1")], { h1: state("h1") });
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate, { title: "" }, { nonsense: true })) });
  assert.equal(stats.candidates, 1);
  assert.equal(stats.invalidCandidates, 2);
});

const recRow = (title: string, start: string, over: Record<string, unknown> = {}) => ({
  eventId: "old1",
  fingerprint: "fp-old",
  title,
  start,
  category: "kids-activities",
  status: "scheduled",
  response: "interested",
  feedback: null,
  calendarLinked: false,
  recommendedAt: "2026-10-09T00:00:00Z",
  withdrawn: false,
  ...over,
});

test("known recommendations reach the ranker and block a same-series candidate", async () => {
  const known = recRow("Riverside Family Pumpkin Festival", "2026-10-17T10:00:00-07:00");
  const f = fakeFf([household("h1")], { h1: state("h1", { recommendations: [known] as FfState["recommendations"] }) });
  const stats = await run({ ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.published, 0);
  assert.equal(stats.skippedByReason["same series as a known recommendation"], 1);

  const dismissed = recRow("Riverside Family Pumpkin Festival", "2026-10-17T10:00:00-07:00", { response: "dismissed" });
  const f2 = fakeFf([household("h1")], { h1: state("h1", { recommendations: [dismissed] as FfState["recommendations"] }) });
  const stats2 = await run({ ff: f2.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats2.published, 1);
});

test("candidate without coordinates is geocoded from its public location only", async () => {
  const queries: string[] = [];
  const geo = { geocode: async (q: string) => (queries.push(q), q.includes("1 Main St") ? null : { lat: 45.51, lon: -122.61 }) };
  const f = fakeFf([household("h1")], {});
  const stats = await run({
    ff: f.ff,
    geocoder: geo,
    runner: fakeRunner(found({ ...candidate, venueName: "Riverside Farm", address: "9 Farm Rd", region: "OR" })),
  });
  assert.equal(stats.geocodeHits, 1);
  assert.equal(stats.geocodeMisses, 0);
  assert.ok(queries.includes("Riverside Farm, 9 Farm Rd, Portland, OR, United States"), queries.join("|"));
  assert.ok(queries.filter((q) => q.includes("1 Main St")).length <= 1);
  assert.equal(f.puts[0].event.location.lat, 45.51);
  assert.equal(f.puts[0].event.location.lon, -122.61);
});

test("failing event geocode counts a miss and keeps the event", async () => {
  let n = 0;
  const geo = {
    geocode: async () => {
      n += 1;
      if (n === 1) return { lat: 45.5, lon: -122.6 }; // household
      throw new Error("nominatim down");
    },
  };
  const f = fakeFf([household("h1")], {});
  const stats = await run({ ff: f.ff, geocoder: geo, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.geocodeMisses, 1);
  assert.equal(stats.geocodeHits, 0);
  assert.equal(stats.newEvents, 1);
  assert.equal(stats.published, 1);
});

async function publishedAt(dLat: number | null) {
  const geo = { geocode: async (q: string) => (q.includes("1 Main St") ? { lat: 45.5, lon: -122.6 } : { lat: 45.5 + (dLat ?? 0), lon: -122.6 }) };
  const f = fakeFf([household("h1")], { h1: state("h1", { preferences: eventPreferencesSchema.parse({ maxDistanceKm: 100 }) }) });
  const cand = dLat === null ? candidate : { ...candidate, venueName: "Riverside Farm", address: "9 Farm Rd", region: "OR" };
  await run({ ff: f.ff, geocoder: dLat === null ? { geocode: async (q: string) => (q.includes("1 Main St") ? { lat: 45.5, lon: -122.6 } : null) } : geo, runner: fakeRunner(found(cand)) });
  return f.puts[0];
}

test("published item carries driveMinutes and tripType from distance", async () => {
  const near = await publishedAt(0.18);
  assert.equal(Math.round(near.distanceKm ?? 0), 20);
  assert.equal(near.driveMinutes, 33);
  assert.equal(near.tripType, "local");
  const far = await publishedAt(0.54);
  assert.equal(far.tripType, "day-trip");
  assert.ok((far.driveMinutes ?? 0) >= 45 && (far.driveMinutes ?? 0) < 90);
});

test("item without distance publishes neither driveMinutes nor tripType", async () => {
  const none = await publishedAt(null);
  assert.equal(none.distanceKm, undefined);
  assert.equal(none.driveMinutes, undefined);
  assert.equal(none.tripType, undefined);
});

const classCand = { ...candidate, title: "Saturday Pottery Course", category: "kids-activities", isClass: true, end: "2026-10-17T12:00:00-07:00" };
const grown = { ...classCand, end: "2026-11-20T12:00:00-07:00" };

async function twoPasses(first: unknown, second: unknown, dryRun = false) {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  await runDiscover({ db, links: okLinks, geocoder, now, runId: "r1", limits, ff: f.ff, runner: confirmingRunner(found(first)) });
  const putsBefore = f.puts.length;
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r2", limits, dryRun, ff: f.ff, runner: confirmingRunner(found(second)) });
  return { stats, pushes: f.puts.length - putsBefore, f };
}

test("class found again with a longer window is pushed once", async () => {
  const { stats, pushes, f } = await twoPasses(classCand, grown);
  assert.equal(stats.merged, 1);
  assert.equal(pushes, 1);
  assert.equal(stats.errors, 0);
  assert.ok(f.puts[f.puts.length - 1].event.schedule.end?.startsWith("2026-11-20"));
});

test("non-class merge pushes nothing", async () => {
  const plain = { ...candidate, end: "2026-10-17T12:00:00-07:00" };
  const { stats, pushes } = await twoPasses(plain, { ...plain, end: "2026-11-20T12:00:00-07:00" });
  assert.equal(stats.merged, 1);
  assert.equal(pushes, 0);
});

test("class merge in dry run pushes nothing", async () => {
  const { stats, pushes } = await twoPasses(classCand, grown, true);
  assert.equal(stats.merged, 1);
  assert.equal(pushes, 0);
});

test("ended class recommendations leave state.known and classes are counted", async () => {
  const ended = recRow("Old Pottery Class", "2026-09-01T10:00:00-07:00", { end: "2026-10-01T12:00:00-07:00" });
  const live = recRow("Chess Lessons", "2026-09-01T10:00:00-07:00", { end: "2026-11-01T12:00:00-07:00", eventId: "old2", fingerprint: "fp2" });
  const f = fakeFf([household("h1")], { h1: state("h1", { recommendations: [ended, live] as FfState["recommendations"] }) });
  const again = { ...classCand, title: "Old Pottery Class", end: "2026-11-20T12:00:00-07:00" };
  const stats = await run({ ff: f.ff, runner: confirmingRunner(found(again)) });
  assert.equal(stats.published, 1);
  assert.equal(stats.classes, 1);
});

const regCand = { ...candidate, registrationUrl: "https://riversidefarm.example/signup", ticketUrl: "https://riversidefarm.example/tickets" };

test("dead official source rejects the candidate before storing", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const links = fakeLinks((u) => (u === candidate.officialUrl ? "dead" : "ok"));
  const stats = await runDiscover({ db, links, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.normalizeRejected, 1);
  assert.equal(stats.normalizeRejectReasons["official source dead"], 1);
  assert.equal(stats.newEvents, 0);
  assert.equal(stats.published, 0);
  assert.equal(stats.linkCheck.dead, 1);
});

test("moved official source rejects the candidate", async () => {
  const f = fakeFf([household("h1")], {});
  const links = fakeLinks(() => "moved");
  const stats = await run({ ff: f.ff, links, runner: fakeRunner(found(candidate)) });
  assert.equal(stats.normalizeRejectReasons["official source dead"], 1);
  assert.equal(stats.newEvents, 0);
});

test("dead registration and ticket links are dropped, event kept at confidence 0.8", async () => {
  const f = fakeFf([household("h1")], {});
  const links = fakeLinks((u) => (u === candidate.officialUrl ? "ok" : "dead"));
  const stats = await run({ ff: f.ff, links, runner: confirmingRunner(found(regCand)) });
  assert.equal(stats.newEvents, 1);
  assert.equal(stats.published, 1);
  const ev = f.puts[0].event;
  assert.equal(ev.cost.registrationUrl, undefined);
  assert.equal(ev.cost.ticketUrl, undefined);
  assert.equal(ev.cost.ticketRequired, false);
  assert.equal(ev.verification.confidence, 0.9); // confirmed on the official page
});

test("blocked official source keeps confidence 0.7", async () => {
  const f = fakeFf([household("h1")], {});
  await run({ ff: f.ff, links: fakeLinks(() => "blocked"), runner: fakeRunner(found(candidate)) });
  assert.equal(f.puts[0].event.verification.confidence, 0.7);
});

test("stored pre-gate event with only listing sources is never published", async () => {
  const db = openEventsDb(":memory:");
  const norm = normalizeCandidate(candidate, { now, defaultTimezone: "America/Los_Angeles" });
  assert.ok(norm.ok);
  if (!norm.ok) return;
  norm.event.sources = [{ ...norm.event.sources[0], url: "https://allevents.in/x", kind: "listing" }];
  upsertEvent(db, norm.event, areaKey(address), "9999-12-31T00:00:00.000Z");
  const f = fakeFf([household("h1")], {});
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r", limits, ff: f.ff, runner: fakeRunner(found()) });
  assert.equal(stats.published, 0);
  assert.equal(f.puts.length, 0);
  assert.equal(stats.skippedByReason["no official source"], 1);
});

test("a run with no candidates never calls check; linkCheck is in stats", async () => {
  const links = fakeLinks();
  const f = fakeFf([household("h1")], {});
  const none = await run({ ff: f.ff, links, runner: fakeRunner(found()) });
  assert.equal(links.urls.length, 0);
  assert.deepEqual(none.linkCheck, zeroStats);
  const links2 = fakeLinks();
  const one = await run({ ff: f.ff, links: links2, runner: fakeRunner(found(candidate)) });
  assert.ok(links2.urls.length >= 1);
  assert.equal(one.linkCheck.ok, links2.urls.length);
});

// --- official page check ---
const classCandidate = {
  ...candidate,
  title: "Toddler Swim Class",
  description: "Weekly swim lessons.",
  officialUrl: "https://riversidefarm.example/swim",
  sourceUrls: ["https://riversidefarm.example/swim"],
};

const isVerify = (prompt: string) => prompt.startsWith("You check whether");

function verifyRunner(
  verify: (prompt: string) => HaikuResult,
  seen: { verify: number; other: string[] } = { verify: 0, other: [] },
) {
  const runner: HaikuRunner = {
    run: async (input) => {
      if (input.prompt.startsWith("Find real")) return found(classCandidate)();
      if (isVerify(input.prompt)) {
        seen.verify += 1;
        return verify(input.prompt);
      }
      return { ok: false, reason: "failed", detail: "no explain in tests" };
    },
  };
  return { runner, seen };
}

const confirmedFor = (prompt: string, over: Record<string, unknown> = {}): HaikuResult => {
  const ids = Array.from(prompt.matchAll(/"eventId":"([^"]+)"/g)).map((m) => m[1]);
  return {
    ok: true,
    data: {
      items: ids.map((eventId) => ({
        eventId,
        confirmed: true,
        currentlyOffered: true,
        providerName: "Riverside Farm",
        start: "2026-10-20T16:00:00-07:00",
        isFree: false,
        minPrice: 150,
        currency: "USD",
        evidence: "Tuesdays 4pm, $150",
        ...over,
      })),
    },
  };
};

test("a failed verify session publishes none of its picks", async () => {
  const f = fakeFf([household("h1")], {});
  const { runner } = verifyRunner(() => ({ ok: false, reason: "failed", detail: "boom" }));
  const stats = await run({ ff: f.ff, runner });
  assert.equal(stats.published, 0);
  assert.equal(f.puts.length, 0);
  assert.equal(stats.officialCheck.unavailable, 1);
  assert.equal(stats.skippedByReason["official page check unavailable"], 1);
});

test("a rejected pick is marked and not ranked on the next run", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const { runner, seen } = verifyRunner((p) => confirmedFor(p, { confirmed: false }));
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r1", limits, ff: f.ff, runner });
  assert.equal(stats.officialCheck.rejected, 1);
  assert.equal(stats.published, 0);
  assert.equal(stats.skippedByReason["official page check failed"], 1);
  const rejected = listRejectedEventIds(db, areaKey(address));
  assert.equal(rejected.size, 1);
  assert.ok(getOfficialCheck(db, Array.from(rejected)[0]).rejectedReason);
  const again = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r2", limits, ff: f.ff, runner });
  assert.equal(seen.verify, 1);
  assert.equal(again.published, 0);
  assert.equal(again.officialCheck.rejected, 0);
});

test("a confirmed pick's schedule and price are what gets published, and it is not rechecked within 7 days", async () => {
  const db = openEventsDb(":memory:");
  const f = fakeFf([household("h1")], {});
  const { runner, seen } = verifyRunner((p) => confirmedFor(p));
  const stats = await runDiscover({ db, links: okLinks, geocoder, now, runId: "r1", limits, ff: f.ff, runner });
  assert.equal(stats.officialCheck.confirmed, 1);
  assert.equal(f.puts.length, 1);
  const ev = f.puts[0].event;
  assert.equal(new Date(ev.schedule.start).toISOString(), new Date("2026-10-20T16:00:00-07:00").toISOString());
  assert.equal(ev.cost.minPrice, 150);
  assert.ok(getOfficialCheck(db, ev.id).checkedAt);
  await runDiscover({ db, links: okLinks, geocoder, now, runId: "r2", limits, ff: f.ff, runner });
  assert.equal(seen.verify, 1);
});

test("a non-sign-up pick is never sent to verify", async () => {
  const f = fakeFf([household("h1")], {});
  const seen = { verify: 0, other: [] as string[] };
  const runner: HaikuRunner = {
    run: async (input) => {
      if (input.prompt.startsWith("Find real")) return found(candidate)();
      if (isVerify(input.prompt)) seen.verify += 1;
      return { ok: false, reason: "failed", detail: "x" };
    },
  };
  const stats = await run({ ff: f.ff, runner });
  assert.equal(seen.verify, 0);
  assert.equal(stats.published, 1);
  assert.deepEqual(stats.officialCheck, { confirmed: 0, rejected: 0, unavailable: 0 });
});

test("reaching the search cap still runs verify", async () => {
  const f = fakeFf([household("h1")], {});
  const { runner, seen } = verifyRunner((p) => confirmedFor(p));
  const stats = await run({ ff: f.ff, runner, limits: { maxTasksPerArea: 3, maxSearches: 1 } });
  assert.equal(stats.searches, 1);
  assert.equal(seen.verify, 1);
  assert.equal(stats.officialCheck.confirmed, 1);
  assert.equal(stats.published, 1);
});

test("verifyReserve holds search sessions back", async () => {
  const f = fakeFf([household("h1")], {});
  const { runner } = verifyRunner((p) => confirmedFor(p));
  const stats = await run({ ff: f.ff, runner, limits: { maxTasksPerArea: 5, maxSearches: 4, verifyReserve: 3 } });
  assert.equal(stats.searches, 1);
});
