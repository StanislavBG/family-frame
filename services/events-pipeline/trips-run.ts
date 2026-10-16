import { createHash } from "node:crypto";
import { EVENTS_LIMITS, eventPreferencesSchema } from "../../shared/events";
import type { RecommendationInput } from "../../shared/events";
import { deleteHousehold, listHouseholds as listLocalHouseholds, listPublishedForHousehold, recordRecommendation } from "./db";
import type { EventsDb } from "./db";
import type { FfClient } from "./ff-client";
import type { HaikuRunner } from "./haiku";
import { nextTripDates, planTrip } from "./trips";
import type { TripKind } from "./trips";

// Keeps up to EVENTS_LIMITS.maxActiveTrips trip ideas per sharing household with
// tripsEnabled. Trips live only in the recommendations row's published_json (never
// in the shared events table). At most one new idea is researched per household per run.

export interface TripRunStats {
  households: number;
  active: number;
  refreshed: number;
  created: number;
  retired: number;
  failed: number;
}

export interface TripRunOptions {
  db: EventsDb;
  ff: Pick<FfClient, "listHouseholds" | "getState" | "putRecommendations">;
  runner: HaikuRunner;
  now: Date;
  runId: string;
  dryRun: boolean;
  onlyHouseholdId?: string;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const hashOf = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function localYmd(now: Date, timezone: string): string {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pickType(active: RecommendationInput[], lastType: TripKind | null): TripKind {
  const count = (t: TripKind) => active.filter((r) => r.trip?.type === t).length;
  const weekend = count("weekend");
  const day = count("day-trip");
  if (weekend === 0) return "weekend";
  if (day === 0) return "day-trip";
  if (weekend !== day) return weekend < day ? "weekend" : "day-trip";
  return lastType === "weekend" ? "day-trip" : "weekend";
}

export async function runTrips(opts: TripRunOptions): Promise<TripRunStats> {
  const { db, ff, runner, now, runId, dryRun, onlyHouseholdId } = opts;
  const stats: TripRunStats = { households: 0, active: 0, refreshed: 0, created: 0, retired: 0, failed: 0 };
  const local = new Map(listLocalHouseholds(db).map((r) => [r.id, r]));
  const listed = await ff.listHouseholds();

  for (const h of listed) {
    if (onlyHouseholdId && h.householdId !== onlyHouseholdId) continue;
    try {
      const state = await ff.getState(h.householdId);
      if ("notSharing" in state) {
        deleteHousehold(db, h.householdId);
        continue;
      }
      const prefs = eventPreferencesSchema.parse(state.preferences);
      stats.households += 1;
      const address = (h.address ?? {}) as { city?: string; region?: string; country?: string; timezone?: string };
      const timezone = h.timezone ?? address.timezone ?? "UTC";
      const today = localYmd(now, timezone);
      const tomorrow = addDays(today, 1);
      const byEvent = new Map(state.recommendations.map((r) => [r.eventId, r]));

      const trips = listPublishedForHousehold(db, h.householdId)
        .filter((r): r is { eventId: string; published: RecommendationInput } => Boolean(r.published?.trip))
        .map((r) => ({ eventId: r.eventId, rec: r.published }));

      const active: RecommendationInput[] = [];
      let publishedOk = true;
      for (const t of trips) {
        const st = byEvent.get(t.eventId);
        const response = st?.response;
        const end = (t.rec.event.schedule.end ?? t.rec.event.schedule.start).slice(0, 10);
        const gonePast = response === "going" && end < today;
        if (response === "not-interested" || response === "dismissed" || st?.withdrawn || gonePast) {
          stats.retired += 1;
          continue;
        }
        let rec = t.rec;
        if (end < tomorrow && !dryRun) {
          const type = (rec.trip?.type ?? "weekend") as TripKind;
          const dates = nextTripDates(type, now, timezone);
          rec = { ...rec, event: { ...rec.event, schedule: { ...rec.event.schedule, start: dates.start, end: dates.end } } };
          const res = await ff.putRecommendations(h.householdId, { runId, recommendations: [rec] });
          if ("notSharing" in res) {
            deleteHousehold(db, h.householdId);
            publishedOk = false;
            break;
          }
          recordRecommendation(db, {
            householdId: h.householdId,
            eventId: rec.event.id,
            publishedAt: now.toISOString(),
            publishedHash: hashOf(rec),
            published: rec,
          });
          stats.refreshed += 1;
        }
        active.push(rec);
      }
      if (!publishedOk) continue;
      stats.active += active.length;

      if (dryRun || !prefs.tripsEnabled || active.length >= EVENTS_LIMITS.maxActiveTrips) continue;

      const row = local.get(h.householdId);
      const type = pickType(active, trips.length ? ((trips[trips.length - 1].rec.trip?.type ?? null) as TripKind | null) : null);
      const planned = await planTrip(
        runner,
        {
          type,
          area: { city: address.city ?? "", ...(address.region ? { region: address.region } : {}), country: address.country ?? "" },
          memberAges: h.memberAges,
          likedCategories: prefs.likedCategories,
          avoidedCategories: prefs.avoidedCategories,
          existingTripTitles: trips.map((t) => t.rec.event.title),
          maxTicketPrice: prefs.maxTicketPrice,
        },
        {
          type,
          household: {
            ...(row?.lat != null && row?.lon != null ? { lat: row.lat, lon: row.lon } : {}),
            timezone,
          },
          now,
        },
      );
      if (!planned.ok) {
        stats.failed += 1;
        console.error(`trips: household ${h.householdId} planning failed: ${planned.reason}`);
        continue;
      }
      if (trips.some((t) => t.eventId === planned.rec.event.id)) {
        stats.failed += 1;
        continue;
      }
      const res = await ff.putRecommendations(h.householdId, { runId, recommendations: [planned.rec] });
      if ("notSharing" in res) {
        deleteHousehold(db, h.householdId);
        continue;
      }
      recordRecommendation(db, {
        householdId: h.householdId,
        eventId: planned.rec.event.id,
        publishedAt: now.toISOString(),
        publishedHash: hashOf(planned.rec),
        published: planned.rec,
      });
      stats.created += 1;
      stats.active += 1;
    } catch (e) {
      stats.failed += 1;
      console.error(`trips: household ${h.householdId} failed: ${errMsg(e)}`);
    }
  }
  return stats;
}
