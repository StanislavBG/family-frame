import { getFirebaseDb } from "./firebase";
import {
  EVENTS_LIMITS,
  putRecommendationsSchema,
  type FfEvent,
  type HouseholdResponse,
} from "@shared/events";

export class EventsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "EventsError";
  }
}

export interface EventsDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are relative paths ("eventId"), null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
}

export interface RecExplanation {
  whyForHousehold: string;
  whyForChildren?: string;
  highlights: string[];
  tips: string[];
  matchScore: number;
  matchReasons: string[];
  distanceKm?: number;
  travelMinutes?: number;
}

export interface EventFeedback {
  relevance?: string;
  sentiment?: string;
  steer?: string;
}

export interface EventCalendarLink {
  calendarEventId: string;
  visibility: "Shared" | "Private";
}

export interface EventPlan {
  occurrenceStart?: string;
  notes?: string;
  people?: string[];
}

export interface StoredRecommendation {
  eventJson: string;
  recJson: string;
  response: HouseholdResponse;
  respondedAt?: string;
  feedback?: EventFeedback;
  calendar?: EventCalendarLink;
  plan?: EventPlan;
  seenAt?: string;
  hasUnseenUpdate: boolean;
  withdrawn: boolean;
  recommendedAt: string;
  lastRunId: string;
}

export interface RecommendationItem {
  eventId: string;
  event: FfEvent;
  rec: RecExplanation;
  response: HouseholdResponse;
  feedback?: EventFeedback;
  calendar?: EventCalendarLink;
  plan?: EventPlan;
  hasUnseenUpdate: boolean;
  withdrawn: boolean;
  recommendedAt: string;
}

export interface ListRecommendationsOptions {
  from?: string;
  to?: string;
  includeHidden?: boolean;
}

export interface UpsertResult {
  created: number;
  updated: number;
  unchanged: number;
  ids: string[];
  changed: string[];
}

export interface RunMeta {
  lastRunId: string;
  lastPublishedAt: string;
  lastRun: unknown;
}

const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const byteSize = (s: string) => Buffer.byteLength(s);

const isHidden = (r: Pick<StoredRecommendation, "response" | "withdrawn">) =>
  r.withdrawn || r.response === "not-interested" || r.response === "dismissed";

function parseJson<T>(text: unknown, what: string, id: string): T | null {
  try {
    return JSON.parse(text as string) as T;
  } catch {
    console.warn(`[events] corrupt ${what} for ${id}; skipping`);
    return null;
  }
}

function toItem(id: string, raw: StoredRecommendation): RecommendationItem | null {
  const event = parseJson<FfEvent>(raw.eventJson, "eventJson", id);
  const rec = parseJson<RecExplanation>(raw.recJson, "recJson", id);
  if (!event || !rec) return null;
  const item: RecommendationItem = {
    eventId: id,
    event,
    rec,
    response: raw.response ?? "new",
    hasUnseenUpdate: !!raw.hasUnseenUpdate,
    withdrawn: !!raw.withdrawn,
    recommendedAt: raw.recommendedAt,
  };
  if (raw.feedback) item.feedback = raw.feedback;
  if (raw.calendar) item.calendar = raw.calendar;
  if (raw.plan) item.plan = raw.plan;
  return item;
}

function latestUpdateAt(event: FfEvent | null): number {
  let latest = -Infinity;
  for (const u of event?.updates ?? []) latest = Math.max(latest, Date.parse(u.at));
  return latest;
}

// True when the incoming event carries news the household has not seen yet.
function hasNewChange(prev: FfEvent | null, next: FfEvent): boolean {
  if (!prev) return false;
  if (prev.status !== next.status) return true;
  return latestUpdateAt(next) > latestUpdateAt(prev);
}

function eventEndMs(event: FfEvent): number {
  const ends = [event.schedule.end, event.schedule.start];
  for (const o of event.schedule.occurrences) ends.push(o.end ?? o.start);
  return Math.max(...ends.filter((s): s is string => !!s).map((s) => Date.parse(s)));
}

function eventStartMs(event: FfEvent): number {
  return Date.parse(event.schedule.start);
}

export function createEventsService(deps: EventsDeps) {
  const nowDate = () => (deps.now ? deps.now() : new Date());
  const now = () => nowDate().toISOString();

  const recsPath = (u: string) => `eventRecs/${u}`;
  const recPath = (u: string, id: string) => `eventRecs/${u}/${id}`;
  const runMetaPath = (u: string) => `eventRunMeta/${u}`;

  async function loadAll(userId: string): Promise<Record<string, StoredRecommendation>> {
    const raw = await deps.get(recsPath(userId));
    const out: Record<string, StoredRecommendation> = {};
    if (raw && typeof raw === "object") {
      for (const [id, rec] of Object.entries(raw)) if (rec && typeof rec === "object") out[id] = rec as StoredRecommendation;
    }
    return out;
  }

  async function loadOne(userId: string, eventId: string): Promise<StoredRecommendation> {
    const raw = await deps.get(recPath(userId, eventId));
    if (!raw) throw new EventsError("Event not found", 404);
    return raw as StoredRecommendation;
  }

  function isPrunable(rec: StoredRecommendation, cutoff: number): boolean {
    if (rec.response !== "new" && rec.response !== "dismissed") return false;
    const event = parseJson<FfEvent>(rec.eventJson, "eventJson", "prune");
    if (!event) return false;
    return eventEndMs(event) < cutoff;
  }

  return {
    // ---- Pipeline upsert -------------------------------------------------
    async upsertRecommendations(userId: string, input: unknown): Promise<UpsertResult> {
      const parsed = putRecommendationsSchema.safeParse(input);
      if (!parsed.success) {
        throw new EventsError(`Invalid recommendations: ${parsed.error.issues[0]?.message ?? "invalid"}`, 400);
      }
      const { runId, recommendations } = parsed.data;

      const prepared = recommendations.map(({ event, ...rec }) => {
        const eventJson = JSON.stringify(event);
        if (byteSize(eventJson) > EVENTS_LIMITS.maxEventJsonBytes) {
          throw new EventsError(`Event ${event.id} exceeds ${EVENTS_LIMITS.maxEventJsonBytes} bytes`, 400);
        }
        return { id: event.id, event, eventJson, recJson: JSON.stringify(rec) };
      });

      const existing = await loadAll(userId);
      const batchIds = new Set(prepared.map((p) => p.id));
      const cutoff = nowDate().getTime() - PRUNE_AFTER_MS;
      const pruneIds = Object.keys(existing).filter((id) => !batchIds.has(id) && isPrunable(existing[id], cutoff));
      const pruned = new Set(pruneIds);

      const remaining = Object.keys(existing).filter((id) => !pruned.has(id));
      const newIds = prepared.filter((p) => !existing[p.id]).length;
      if (remaining.length + newIds > EVENTS_LIMITS.maxActivePerHousehold) {
        throw new EventsError(`Household event limit of ${EVENTS_LIMITS.maxActivePerHousehold} reached`, 409);
      }

      const stamp = now();
      const writes: Record<string, any> = {};
      for (const id of pruneIds) writes[id] = null;
      const result: UpsertResult = { created: 0, updated: 0, unchanged: 0, ids: [], changed: [] };

      for (const p of prepared) {
        const prev = existing[p.id];
        result.ids.push(p.id);
        if (!prev) {
          result.created++;
          writes[p.id] = {
            eventJson: p.eventJson,
            recJson: p.recJson,
            response: "new",
            hasUnseenUpdate: false,
            withdrawn: false,
            recommendedAt: stamp,
            lastRunId: runId,
          } satisfies StoredRecommendation;
          continue;
        }
        const same = prev.eventJson === p.eventJson && prev.recJson === p.recJson && !prev.withdrawn;
        if (same) {
          result.unchanged++;
          if (prev.lastRunId !== runId) writes[p.id] = { ...prev, lastRunId: runId };
          continue;
        }
        const prevEvent = parseJson<FfEvent>(prev.eventJson, "eventJson", p.id);
        const flagged = hasNewChange(prevEvent, p.event);
        if (flagged) result.changed.push(p.id);
        result.updated++;
        // Spread keeps every household-owned field; only pipeline-owned ones are replaced.
        writes[p.id] = {
          ...prev,
          eventJson: p.eventJson,
          recJson: p.recJson,
          hasUnseenUpdate: prev.hasUnseenUpdate || flagged,
          withdrawn: false,
          lastRunId: runId,
        } satisfies StoredRecommendation;
      }

      await deps.update(recsPath(userId), writes);
      return result;
    },

    async listRecommendations(userId: string, opts: ListRecommendationsOptions = {}): Promise<RecommendationItem[]> {
      const from = opts.from ? Date.parse(opts.from) : undefined;
      const to = opts.to ? Date.parse(opts.to) : undefined;
      const all = await loadAll(userId);
      const items: RecommendationItem[] = [];
      for (const [id, raw] of Object.entries(all)) {
        if (!opts.includeHidden && isHidden({ response: raw.response ?? "new", withdrawn: !!raw.withdrawn })) continue;
        const item = toItem(id, raw);
        if (!item) continue;
        const start = eventStartMs(item.event);
        if (from !== undefined && eventEndMs(item.event) < from) continue;
        if (to !== undefined && start > to) continue;
        items.push(item);
      }
      return items.sort((a, b) => eventStartMs(a.event) - eventStartMs(b.event));
    },

    async getRecommendation(userId: string, eventId: string): Promise<RecommendationItem> {
      const raw = await loadOne(userId, eventId);
      const item = toItem(eventId, raw);
      if (!item) throw new EventsError("Event not found", 404);
      return item;
    },

    // Pipeline withdraws an event it no longer recommends.
    async withdraw(userId: string, eventId: string): Promise<{ deleted: boolean }> {
      const raw = await loadOne(userId, eventId);
      const response = raw.response ?? "new";
      if (response === "new" || response === "not-interested" || response === "dismissed") {
        await deps.remove(recPath(userId, eventId));
        return { deleted: true };
      }
      await deps.update(recPath(userId, eventId), { withdrawn: true });
      return { deleted: false };
    },

    async markSeen(userId: string, eventId: string): Promise<void> {
      await loadOne(userId, eventId);
      await deps.update(recPath(userId, eventId), { seenAt: now(), hasUnseenUpdate: false });
    },

    async recordRun(userId: string, run: { runId: string; [k: string]: unknown }): Promise<RunMeta> {
      if (!run || typeof run.runId !== "string" || !run.runId) throw new EventsError("runId is required", 400);
      const meta: RunMeta = { lastRunId: run.runId, lastPublishedAt: now(), lastRun: JSON.parse(JSON.stringify(run)) };
      await deps.set(runMetaPath(userId), meta);
      return meta;
    },

    // ---- Feedback and preferences (added by a later PRD) ----

    // ---- Respond and calendar sync (added by a later PRD) ----
  };
}

export type EventsService = ReturnType<typeof createEventsService>;

let instance: EventsService | null = null;

function defaultService(): EventsService {
  if (!instance) {
    instance = createEventsService({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async update(path, values) {
        await getFirebaseDb().ref(path).update(values);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const eventsService: EventsService = {
  upsertRecommendations: (...args) => defaultService().upsertRecommendations(...args),
  listRecommendations: (...args) => defaultService().listRecommendations(...args),
  getRecommendation: (...args) => defaultService().getRecommendation(...args),
  withdraw: (...args) => defaultService().withdraw(...args),
  markSeen: (...args) => defaultService().markSeen(...args),
  recordRun: (...args) => defaultService().recordRun(...args),
};
