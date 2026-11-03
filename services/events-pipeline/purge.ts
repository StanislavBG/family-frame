import { deleteEvent, deleteHousehold, deleteRecommendation, isStillToCome, listAllEvents, listHouseholdsHoldingEvent, listPublishedForHousehold, setNextCheckAt, type EventsDb } from "./db";
import type { FfClient } from "./ff-client";
import { isSignUpActivity } from "../../shared/events-activity";
import { hasOfficialSource } from "../../shared/events-sources";

export interface PurgeHouseholdStats {
  householdId: string;
  withdrawn: number;
  kept: number;
  titles: string[];
}

export interface PurgeStats {
  mode: "purge-signups";
  dryRun: boolean;
  households: PurgeHouseholdStats[];
  deletedEvents: number;
  markedDue: number;
}

/** Withdraw unanswered, unlinked sign-up recommendations and clean up local events without an official source. */
export async function runPurgeSignups(opts: {
  db: EventsDb;
  ff: FfClient;
  now: Date;
  dryRun: boolean;
  onlyHouseholdId?: string;
}): Promise<PurgeStats> {
  const { db, ff, dryRun } = opts;
  const nowIso = opts.now.toISOString();
  const households: PurgeHouseholdStats[] = [];

  for (const h of await ff.listHouseholds()) {
    if (opts.onlyHouseholdId && h.householdId !== opts.onlyHouseholdId) continue;
    const stats: PurgeHouseholdStats = { householdId: h.householdId, withdrawn: 0, kept: 0, titles: [] };
    const state = await ff.getState(h.householdId);
    if ("notSharing" in state) {
      if (!dryRun) deleteHousehold(db, h.householdId);
      households.push(stats);
      continue;
    }
    const remote = new Map(state.recommendations.map((r) => [r.eventId, r]));
    for (const row of listPublishedForHousehold(db, h.householdId)) {
      const event = row.published?.event;
      if (!event || row.published?.trip || !isSignUpActivity(event)) continue;
      const rec = remote.get(row.eventId);
      if (!rec || rec.withdrawn) {
        stats.withdrawn++;
        stats.titles.push(event.title);
        if (!dryRun) deleteRecommendation(db, h.householdId, row.eventId);
      } else if (rec.response === "new" && !rec.calendarLinked) {
        stats.withdrawn++;
        stats.titles.push(event.title);
        if (!dryRun) {
          const res = await ff.withdraw(h.householdId, row.eventId);
          if (!("notSharing" in res)) deleteRecommendation(db, h.householdId, row.eventId);
          else deleteHousehold(db, h.householdId);
        }
      } else {
        stats.kept++;
      }
    }
    households.push(stats);
  }

  let deletedEvents = 0;
  let markedDue = 0;
  if (!dryRun) {
    for (const { id, event } of listAllEvents(db)) {
      const held = listHouseholdsHoldingEvent(db, id).length > 0;
      const official = hasOfficialSource(event);
      if (!held) {
        if (isSignUpActivity(event) || !official) {
          deleteEvent(db, id);
          deletedEvents++;
        }
      } else if (!official && isStillToCome(event, nowIso)) {
        if (setNextCheckAt(db, id, nowIso)) markedDue++;
      }
    }
  }
  return { mode: "purge-signups", dryRun, households, deletedEvents, markedDue };
}
