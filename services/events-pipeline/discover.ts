import { createHash } from "node:crypto";
import {
  EVENTS_LIMITS,
  eventPreferencesSchema,
  feedbackEntrySchema,
  recommendationInputSchema,
  type FeedbackEntry,
  type FfEvent,
  type RecommendationInput,
} from "../../shared/events";
import { aggregatePreferences, type PreferenceSummary } from "../../shared/events-preferences";
import {
  deleteHousehold,
  getEvent,
  getEventByFingerprint,
  listEventsInArea,
  listHouseholds as listLocalHouseholds,
  listRecommendationsForHousehold,
  lastSearchAt,
  logSearch,
  markHouseholdDiscovered,
  recordRecommendation,
  upsertEvent,
  upsertHousehold,
  startRun,
  finishRun,
  type EventsDb,
} from "./db";
import { nextCheckAt } from "./dispatch";
import { explainBatch } from "./explain";
import type { FfClient, FfHousehold, FfState } from "./ff-client";
import { areaKey as areaKeyOf, geocodeHousehold, type Geocoder } from "./geo";
import type { HaikuRunner } from "./haiku";
import { isNearDuplicate, mergeDuplicate, normalizeCandidate } from "./normalize";
import { rankForHousehold, type BusyInterval, type RankLimits } from "./rank";
import { ageBandsFromAges, planSearchTasks, runSearchTask, type WindowKey } from "./search";

const DAY_MS = 86_400_000;
const NEVER = "9999-12-31T00:00:00.000Z";
const SEARCH_HORIZON_DAYS = 90;

export interface DiscoverLimits {
  /** Hard cap on search sessions in this run. */
  maxSearches?: number;
  /** Search tasks planned per area. */
  maxTasksPerArea?: number;
  rank?: RankLimits;
}

export interface DiscoverStats {
  households: number;
  purged: number;
  searches: number;
  candidates: number;
  newEvents: number;
  merged: number;
  published: number;
  skipped: number;
  errors: number;
}

export interface DiscoverOptions {
  db: EventsDb;
  ff: Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations" | "recordRun">;
  runner: HaikuRunner;
  geocoder: Pick<Geocoder, "geocode">;
  now: Date;
  runId: string;
  dryRun?: boolean;
  onlyHouseholdId?: string;
  limits?: DiscoverLimits;
}

interface Active {
  h: FfHousehold;
  state: FfState;
  areaKey: string;
  lat: number | null;
  lon: number | null;
  feedback: FeedbackEntry[];
  learned: PreferenceSummary;
}

export const addressHashOf = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const hashOf = addressHashOf;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function parseFeedback(raw: unknown[]): FeedbackEntry[] {
  const out: FeedbackEntry[] = [];
  for (const r of raw) {
    const p = feedbackEntrySchema.safeParse(r);
    if (p.success) out.push(p.data);
  }
  return out;
}

export async function runDiscover(opts: DiscoverOptions): Promise<DiscoverStats> {
  const { db, ff, runner, geocoder, now, runId, dryRun = false, onlyHouseholdId, limits = {} } = opts;
  const stats: DiscoverStats = {
    households: 0,
    purged: 0,
    searches: 0,
    candidates: 0,
    newEvents: 0,
    merged: 0,
    published: 0,
    skipped: 0,
    errors: 0,
  };
  const startedAt = now.toISOString();
  startRun(db, "discover", startedAt, runId);

  // 1. Who is still sharing, and purge everyone who is not.
  const listed = await ff.listHouseholds();
  const listedIds = new Set(listed.map((h) => h.householdId));
  const local = new Map(listLocalHouseholds(db).map((r) => [r.id, r]));
  for (const id of Array.from(local.keys())) {
    if (listedIds.has(id)) continue;
    deleteHousehold(db, id);
    local.delete(id);
    stats.purged += 1;
  }

  // 2. Upsert households (geocode only on a changed address) and read their state first.
  const active: Active[] = [];
  for (const h of listed) {
    if (onlyHouseholdId && h.householdId !== onlyHouseholdId) continue;
    stats.households += 1;
    try {
      const addressHash = hashOf(h.address);
      const prev = local.get(h.householdId);
      let lat = prev?.lat ?? null;
      let lon = prev?.lon ?? null;
      if (!prev || prev.addressHash !== addressHash || lat === null || lon === null) {
        const g = await geocodeHousehold(geocoder, h.address);
        lat = g?.lat ?? null;
        lon = g?.lon ?? null;
      }
      const areaKey = areaKeyOf(h.address);
      upsertHousehold(db, {
        id: h.householdId,
        address: h.address,
        addressHash,
        lat,
        lon,
        areaKey,
        profile: { memberAges: h.memberAges, preferences: h.preferences, timezone: h.timezone },
        updatedAt: startedAt,
      });
      const state = await ff.getState(h.householdId);
      if ("notSharing" in state) {
        deleteHousehold(db, h.householdId);
        stats.purged += 1;
        continue;
      }
      const prefs = eventPreferencesSchema.parse(state.preferences);
      const feedback = parseFeedback(state.feedback);
      active.push({
        h,
        state: { ...state, preferences: prefs },
        areaKey,
        lat,
        lon,
        feedback,
        learned: aggregatePreferences(feedback, prefs, { now }),
      });
    } catch (e) {
      stats.errors += 1;
      console.error(`discover: household ${h.householdId} setup failed: ${errMsg(e)}`);
    }
  }

  // 3. Search once per area, then normalize, de-duplicate and store.
  const horizonIso = new Date(now.getTime() + SEARCH_HORIZON_DAYS * DAY_MS).toISOString();
  const maxSearches = limits.maxSearches ?? Infinity;
  let stopped = false;
  const byArea = new Map<string, Active[]>();
  for (const a of active) byArea.set(a.areaKey, [...(byArea.get(a.areaKey) ?? []), a]);

  for (const [areaKey, group] of Array.from(byArea.entries())) {
    if (stopped) break;
    const first = group[0].h.address;
    const area = {
      city: first.city,
      ...(first.region ? { region: first.region } : {}),
      country: first.country,
      radiusKm: Math.max(...group.map((g) => g.state.preferences.maxDistanceKm)),
    };
    const known = (): { title: string; date: string }[] => [
      ...listEventsInArea(db, areaKey, startedAt, horizonIso).map((e) => ({ title: e.title, date: e.schedule.start.slice(0, 10) })),
      ...group.flatMap((g) => g.state.recommendations.map((r) => ({ title: r.title, date: r.start.slice(0, 10) }))),
    ];
    const tasks = planSearchTasks({
      areaKey,
      area,
      radiusKm: area.radiusKm,
      households: group.map((g) => ({ preferences: g.state.preferences, learned: g.learned, memberAges: g.h.memberAges })),
      lastSearchAt: (w: WindowKey, c: string) => lastSearchAt(db, areaKey, w, c),
      now,
      maxTasks: limits.maxTasksPerArea,
    });
    const ages = group.flatMap((g) => g.h.memberAges);
    const bands = ageBandsFromAges(ages);
    const audienceHint = bands.length > 0 ? `Family with ${bands.join(", ")}` : "";
    const defaultTimezone = first.timezone ?? group[0].h.timezone ?? "UTC";

    for (const task of tasks) {
      if (stats.searches >= maxSearches) {
        stopped = true;
        break;
      }
      stats.searches += 1;
      const res = await runSearchTask(runner, task, area, known(), audienceHint);
      if (!res.ok) {
        if (res.reason === "rate-limited" || res.reason === "budget-exhausted") {
          stopped = true;
          break;
        }
        stats.errors += 1;
        continue;
      }
      logSearch(db, {
        areaKey,
        windowKey: task.windowKey,
        categoryKey: task.categoryKey,
        query: `${task.fromDate}..${task.toDate} ${task.categories.join(",")}`,
        ranAt: now.toISOString(),
        results: res.candidates.length,
        runId,
      });
      stats.candidates += res.candidates.length;
      for (const raw of res.candidates) {
        try {
          const norm = normalizeCandidate(raw, { now, defaultTimezone });
          if (!norm.ok) continue;
          const incoming = norm.event;
          const existing =
            getEventByFingerprint(db, incoming.fingerprint) ??
            getEvent(db, incoming.id) ??
            listEventsInArea(db, areaKey, startedAt, horizonIso).find((e) => isNearDuplicate(e, incoming));
          if (existing) {
            const merged = mergeDuplicate(existing, incoming);
            upsertEvent(db, merged, areaKey, nextCheckAt(merged, now) ?? NEVER);
            stats.merged += 1;
          } else {
            upsertEvent(db, incoming, areaKey, nextCheckAt(incoming, now) ?? NEVER);
            stats.newEvents += 1;
          }
        } catch (e) {
          stats.errors += 1;
          console.error(`discover: candidate failed: ${errMsg(e)}`);
        }
      }
    }
  }

  // 4. Rank, explain and publish per household, from whatever the repository holds.
  const explainRunner: HaikuRunner = stopped
    ? { run: async () => ({ ok: false, reason: "budget-exhausted", detail: "search stopped" }) }
    : runner;
  for (const a of active) {
    const hhId = a.h.householdId;
    try {
      const events: FfEvent[] = listEventsInArea(db, a.areaKey, startedAt, horizonIso);
      const knownIds = new Set(a.state.recommendations.map((r) => r.eventId));
      const knownFps = new Set(a.state.recommendations.map((r) => r.fingerprint));
      for (const r of listRecommendationsForHousehold(db, hhId)) {
        knownIds.add(r.eventId);
        const ev = getEvent(db, r.eventId);
        if (ev) knownFps.add(ev.fingerprint);
      }
      const ranked = rankForHousehold({
        events,
        household: {
          ...(a.lat !== null && a.lon !== null ? { lat: a.lat, lon: a.lon } : {}),
          memberAges: a.h.memberAges,
          preferences: a.state.preferences,
          learned: a.learned,
        },
        state: { knownEventIds: Array.from(knownIds), knownFingerprints: Array.from(knownFps), busy: a.state.busy as BusyInterval[] },
        now,
        limits: limits.rank,
      });
      stats.skipped += ranked.skipped.length;

      const items: RecommendationInput[] = [];
      if (ranked.picks.length > 0) {
        const texts = await explainBatch(
          explainRunner,
          {
            city: a.h.address.city,
            memberAges: a.h.memberAges,
            likedCategories: a.state.preferences.likedCategories,
            preferenceLines: a.learned.lines,
          },
          ranked.picks.map((p) => ({ event: p.event, matchReasons: p.matchReasons, distanceKm: p.distanceKm })),
        );
        for (const p of ranked.picks) {
          const t = texts.get(p.event.id);
          if (!t) continue;
          const parsed = recommendationInputSchema.safeParse({
            event: p.event,
            whyForHousehold: t.whyForHousehold,
            ...(t.whyForChildren ? { whyForChildren: t.whyForChildren } : {}),
            highlights: t.highlights,
            tips: t.tips,
            matchScore: clamp01(p.score),
            matchReasons: p.matchReasons.slice(0, 5).map((r) => r.slice(0, 200)),
            ...(p.distanceKm !== undefined ? { distanceKm: p.distanceKm } : {}),
          });
          if (parsed.success) items.push(parsed.data);
          else stats.errors += 1;
        }
      }

      let published = 0;
      if (dryRun) {
        for (const it of items) console.log(`[dry-run] ${hhId}: would publish "${it.event.title}" (${it.event.schedule.start}) score ${it.matchScore.toFixed(2)}`);
        published = items.length;
      } else {
        let revoked = false;
        for (let i = 0; i < items.length && !revoked; i += EVENTS_LIMITS.maxBatch) {
          const batch = items.slice(i, i + EVENTS_LIMITS.maxBatch);
          const res = await ff.putRecommendations(hhId, { runId, recommendations: batch });
          if ("notSharing" in res) {
            deleteHousehold(db, hhId);
            stats.purged += 1;
            revoked = true;
            break;
          }
          for (const it of batch) {
            recordRecommendation(db, {
              householdId: hhId,
              eventId: it.event.id,
              publishedAt: now.toISOString(),
              publishedHash: hashOf(it),
              published: it,
            });
          }
          published += batch.length;
        }
        if (revoked) continue;
      }
      stats.published += published;
      markHouseholdDiscovered(db, hhId, now.toISOString());

      if (!dryRun) {
        const res = await ff.recordRun(hhId, {
          runId,
          kind: "discover",
          startedAt,
          finishedAt: new Date().toISOString(),
          stats: { ...stats, published, skipped: ranked.skipped.length },
        });
        if ("notSharing" in res) {
          deleteHousehold(db, hhId);
          stats.purged += 1;
        }
      }
    } catch (e) {
      stats.errors += 1;
      console.error(`discover: household ${hhId} failed: ${errMsg(e)}`);
    }
  }

  finishRun(db, runId, new Date().toISOString(), stats);
  return stats;
}
