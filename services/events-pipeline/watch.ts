import type { EventsDb, LocalHouseholdRecord } from "./db";
import { listHouseholds as listLocalHouseholds, markHouseholdTriggered } from "./db";
import { addressHashOf, runDiscover, type DiscoverOptions, type DiscoverStats } from "./discover";
import type { FfHousehold } from "./ff-client";

const MINUTE_MS = 60_000;

export type PendingReason = "new" | "address-changed" | "never-discovered";

export interface PendingHousehold {
  householdId: string;
  reason: PendingReason;
}

export interface FindPendingOptions {
  cooldownMinutes?: number;
  maxPerTick?: number;
}

export interface PendingResult {
  pending: PendingHousehold[];
  /** Pending households left for a later tick because of maxPerTick. */
  deferred: number;
}

/** Pure: which listed households need discovery now (new, address changed, or never discovered). */
export function findPendingHouseholds(
  listed: Pick<FfHousehold, "householdId" | "address">[],
  localRows: LocalHouseholdRecord[],
  nowIso: string,
  { cooldownMinutes = 30, maxPerTick = 3 }: FindPendingOptions = {},
): PendingResult {
  const local = new Map(localRows.map((r) => [r.id, r]));
  const nowMs = Date.parse(nowIso);
  const candidates: { householdId: string; reason: PendingReason; triggered: string | null }[] = [];
  for (const h of listed) {
    const row = local.get(h.householdId);
    let reason: PendingReason | null = null;
    if (!row) reason = "new";
    else if (row.addressHash !== addressHashOf(h.address)) reason = "address-changed";
    else if (row.lastDiscoveredAt === null) reason = "never-discovered";
    if (!reason) continue;
    const triggered = row?.lastTriggeredAt ?? null;
    if (triggered !== null && nowMs - Date.parse(triggered) < cooldownMinutes * MINUTE_MS) continue;
    candidates.push({ householdId: h.householdId, reason, triggered });
  }
  candidates.sort((a, b) => {
    if (a.triggered !== b.triggered) {
      if (a.triggered === null) return -1;
      if (b.triggered === null) return 1;
      return a.triggered < b.triggered ? -1 : 1;
    }
    return a.householdId < b.householdId ? -1 : a.householdId > b.householdId ? 1 : 0;
  });
  return {
    pending: candidates.slice(0, maxPerTick).map(({ householdId, reason }) => ({ householdId, reason })),
    deferred: Math.max(0, candidates.length - maxPerTick),
  };
}

export interface WatchOptions {
  db: EventsDb;
  ff: DiscoverOptions["ff"];
  runner: DiscoverOptions["runner"];
  geocoder: DiscoverOptions["geocoder"];
  now: Date;
  runIdPrefix: string;
  dryRun?: boolean;
  findOpts?: FindPendingOptions;
  limits?: DiscoverOptions["limits"];
}

export interface WatchRun {
  householdId: string;
  reason: PendingReason;
  stats?: DiscoverStats;
  error?: string;
}

export interface WatchResult {
  listed: number;
  pending: number;
  deferred: number;
  runs: WatchRun[];
}

/** One cheap tick: a single listHouseholds call, then discovery for just the pending households. */
export async function runWatch(opts: WatchOptions): Promise<WatchResult> {
  const { db, ff, runner, geocoder, now, runIdPrefix, dryRun = false, findOpts, limits } = opts;
  const listed = await ff.listHouseholds();
  const nowIso = now.toISOString();
  const { pending, deferred } = findPendingHouseholds(listed, listLocalHouseholds(db), nowIso, findOpts);
  const runs: WatchRun[] = [];
  for (const p of pending) {
    // Mark before and after: a brand-new household has no local row until discover upserts it.
    markHouseholdTriggered(db, p.householdId, nowIso);
    try {
      const stats = await runDiscover({
        db,
        ff,
        runner,
        geocoder,
        now,
        runId: `${runIdPrefix}-${p.householdId}`,
        dryRun,
        onlyHouseholdId: p.householdId,
        limits,
      });
      runs.push({ householdId: p.householdId, reason: p.reason, stats });
    } catch (e) {
      runs.push({ householdId: p.householdId, reason: p.reason, error: e instanceof Error ? e.message : String(e) });
    }
    markHouseholdTriggered(db, p.householdId, nowIso);
  }
  return { listed: listed.length, pending: pending.length, deferred, runs };
}
