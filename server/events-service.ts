import { randomUUID } from "node:crypto";
import { getFirebaseDb } from "./firebase";
import { calendarService, type CalendarService } from "./calendar-service";
import type { CalendarEvent } from "@shared/schema";
import {
  EVENTS_LIMITS,
  eventPreferencesSchema,
  patchPlanSchema,
  postFeedbackSchema,
  postResponseSchema,
  putRecommendationsSchema,
  type EventPreferences,
  type FeedbackEntry,
  type FeedbackSignal,
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
  // Appends under a generated key (RTDB ref.push).
  push(path: string, value: any): Promise<void>;
  now?(): Date;
  // Defaults to the real calendar service; tests inject a fake.
  calendar?: Pick<CalendarService, "createEvent" | "setLinkedFields" | "deleteEvent" | "listEvents">;
}

export interface BusyInterval {
  start: string;
  end: string;
  allDay: boolean;
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
const FEEDBACK_DEFAULT_LIMIT = 500;
const FEEDBACK_MAX_LIMIT = 5000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AXIS: Record<FeedbackSignal, keyof EventFeedback> = {
  relevant: "relevance",
  "not-relevant": "relevance",
  liked: "sentiment",
  disliked: "sentiment",
  "more-like-this": "steer",
  "less-like-this": "steer",
};

function weekdayIndex(startIso: string, timeZone: string): number {
  const date = new Date(startIso);
  let short: string;
  try {
    short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  } catch {
    short = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
  }
  return Math.max(0, WEEKDAYS.indexOf(short));
}

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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}/;

// Local YYYY-MM-DD and HH:MM of an instant in a timezone (falls back to UTC for unknown zones).
function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format("UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

type DateFields = { startDate: string; endDate: string; startTime?: string; endTime?: string };

// Calendar date/time fields for the occurrence starting at `occurrenceStart` (default: the main schedule).
function calendarDates(event: FfEvent, occurrenceStart?: string): DateFields {
  const { schedule } = event;
  let start = schedule.start;
  let end = schedule.end;
  if (occurrenceStart !== undefined && Date.parse(occurrenceStart) !== Date.parse(schedule.start)) {
    const occ = schedule.occurrences.find((o) => Date.parse(o.start) === Date.parse(occurrenceStart));
    if (occ) {
      start = occ.start;
      end = occ.end;
    }
  }
  if (schedule.allDay) {
    const startDate = DATE_ONLY.test(start) ? start.slice(0, 10) : localParts(start, schedule.timezone).date;
    const endDate = end ? (DATE_ONLY.test(end) ? end.slice(0, 10) : localParts(end, schedule.timezone).date) : startDate;
    return { startDate, endDate: endDate < startDate ? startDate : endDate };
  }
  const s = localParts(start, schedule.timezone);
  const out: DateFields = { startDate: s.date, endDate: s.date, startTime: s.time };
  if (end) {
    const e = localParts(end, schedule.timezone);
    out.endDate = e.date;
    out.endTime = e.time;
  }
  return out;
}

const scheduleKey = (e: FfEvent) => JSON.stringify([e.schedule.timezone, e.schedule.start, e.schedule.end, e.schedule.allDay, e.schedule.occurrences]);

const eventLocation = (e: FfEvent) => [e.location.venueName, e.location.city].filter(Boolean).join(", ");

// The calendar entry is gone (household deleted it) when the calendar service says 403/404.
const isMissingEntry = (err: unknown) => {
  const status = (err as { status?: number } | null)?.status;
  return status === 403 || status === 404;
};

export function createEventsService(deps: EventsDeps) {
  const calendar = () => deps.calendar ?? calendarService;
  const nowDate = () => (deps.now ? deps.now() : new Date());
  const now = () => nowDate().toISOString();

  const recsPath = (u: string) => `eventRecs/${u}`;
  const recPath = (u: string, id: string) => `eventRecs/${u}/${id}`;
  const runMetaPath = (u: string) => `eventRunMeta/${u}`;
  const feedbackPath = (u: string) => `eventFeedback/${u}`;
  const prefsPath = (u: string) => `eventPrefs/${u}`;

  async function pushFeedback(userId: string, eventId: string, signal: FeedbackEntry["signal"], reason: string | undefined, raw: StoredRecommendation) {
    const event = parseJson<FfEvent>(raw.eventJson, "eventJson", eventId);
    if (!event) throw new EventsError("Event not found", 404);
    const rec = parseJson<RecExplanation>(raw.recJson, "recJson", eventId);
    const snapshot: FeedbackEntry["snapshot"] = {
      title: event.title,
      category: event.category,
      tags: event.tags,
      isFree: event.cost.isFree,
      weekday: weekdayIndex(event.schedule.start, event.schedule.timezone),
      ageBands: event.audience.ageBands,
    };
    if (rec?.distanceKm !== undefined) snapshot.distanceKm = rec.distanceKm;
    const entry: FeedbackEntry = { id: randomUUID(), at: now(), eventId, signal, snapshot };
    if (reason) entry.reason = reason;
    await deps.push(feedbackPath(userId), entry);
  }

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

  // Moves the linked calendar entry along with a pipeline change; returns null when the entry is gone.
  async function syncCalendar(
    userId: string,
    link: EventCalendarLink,
    prev: StoredRecommendation,
    prevEvent: FfEvent,
    next: FfEvent,
  ): Promise<EventCalendarLink | null> {
    const patch: Parameters<ReturnType<typeof calendar>["setLinkedFields"]>[3] = {};
    if (next.status === "cancelled" && prevEvent.status !== "cancelled") patch.cancelled = true;
    else if (prevEvent.status === "cancelled" && next.status !== "cancelled") patch.cancelled = false;
    if (scheduleKey(prevEvent) !== scheduleKey(next) && !prev.plan?.occurrenceStart) {
      Object.assign(patch, calendarDates(next));
      // Explicit empty strings clear stale times (all-day or end removed).
      patch.startTime = patch.startTime ?? "";
      patch.endTime = patch.endTime ?? "";
    }
    if (Object.keys(patch).length === 0) return link;
    try {
      await calendar().setLinkedFields(userId, "", link.calendarEventId, patch);
      return link;
    } catch (err) {
      if (isMissingEntry(err)) return null;
      throw err;
    }
  }

  const service = {
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
        let calendarLink = prev.calendar;
        if (calendarLink && prevEvent) {
          calendarLink = (await syncCalendar(userId, calendarLink, prev, prevEvent, p.event)) ?? undefined;
        }
        // Spread keeps every household-owned field; only pipeline-owned ones are replaced.
        writes[p.id] = {
          ...prev,
          eventJson: p.eventJson,
          recJson: p.recJson,
          hasUnseenUpdate: prev.hasUnseenUpdate || flagged,
          withdrawn: false,
          lastRunId: runId,
        } satisfies StoredRecommendation;
        if (calendarLink) writes[p.id].calendar = calendarLink;
        else delete writes[p.id].calendar;
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

    // ---- Feedback and preferences ----
    async appendFeedback(userId: string, eventId: string, body: unknown): Promise<FeedbackEntry["signal"]> {
      const parsed = postFeedbackSchema.safeParse(body);
      if (!parsed.success) {
        throw new EventsError(`Invalid feedback: ${parsed.error.issues[0]?.message ?? "invalid"}`, 400);
      }
      const { signal, reason } = parsed.data;
      const raw = await loadOne(userId, eventId);
      await pushFeedback(userId, eventId, signal, reason, raw);
      await deps.update(recPath(userId, eventId), { feedback: { ...(raw.feedback ?? {}), [AXIS[signal]]: signal } });
      return signal;
    },

    async appendResponseFeedback(userId: string, eventId: string, response: Exclude<HouseholdResponse, "new">, reason?: string): Promise<void> {
      const raw = await loadOne(userId, eventId);
      await pushFeedback(userId, eventId, `response:${response}` as FeedbackEntry["signal"], reason, raw);
    },

    async listFeedback(userId: string, opts: { since?: string; limit?: number } = {}): Promise<FeedbackEntry[]> {
      const limit = Math.min(Math.max(Math.floor(opts.limit ?? FEEDBACK_DEFAULT_LIMIT) || FEEDBACK_DEFAULT_LIMIT, 1), FEEDBACK_MAX_LIMIT);
      const since = opts.since ? Date.parse(opts.since) : undefined;
      const raw = await deps.get(feedbackPath(userId));
      const entries: FeedbackEntry[] = raw && typeof raw === "object" ? (Object.values(raw) as FeedbackEntry[]) : [];
      return entries
        .filter((e) => e && (since === undefined || Date.parse(e.at) > since))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, limit);
    },

    async getPreferences(userId: string): Promise<EventPreferences> {
      const stored = await deps.get(prefsPath(userId));
      return eventPreferencesSchema.parse(stored ?? {});
    },

    async putPreferences(userId: string, body: unknown): Promise<EventPreferences> {
      const parsed = eventPreferencesSchema.safeParse(body);
      if (!parsed.success) {
        throw new EventsError(`Invalid preferences: ${parsed.error.issues[0]?.message ?? "invalid"}`, 400);
      }
      await deps.set(prefsPath(userId), parsed.data);
      return parsed.data;
    },

    // Erases all events data for a household; calendar entries are left alone.
    async deleteAllForHousehold(userId: string): Promise<void> {
      await deps.remove(recsPath(userId));
      await deps.remove(feedbackPath(userId));
      await deps.remove(prefsPath(userId));
      await deps.remove(runMetaPath(userId));
    },

    // ---- Respond and calendar sync ----
    async respond(userId: string, username: string, eventId: string, body: unknown): Promise<RecommendationItem> {
      const parsed = postResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new EventsError(`Invalid response: ${parsed.error.issues[0]?.message ?? "invalid"}`, 400);
      }
      const { response, reason, visibility, people } = parsed.data;
      const raw = await loadOne(userId, eventId);
      const event = parseJson<FfEvent>(raw.eventJson, "eventJson", eventId);
      if (!event) throw new EventsError("Event not found", 404);

      await service.appendResponseFeedback(userId, eventId, response, reason);

      const resolvedPeople = people ?? raw.plan?.people;
      const createLinked = async (): Promise<EventCalendarLink> => {
        const vis = visibility ?? "Private";
        const input: Parameters<ReturnType<typeof calendar>["createEvent"]>[2] = {
          title: event!.title,
          ...calendarDates(event!, raw.plan?.occurrenceStart),
          type: vis,
          people: resolvedPeople ?? [],
        };
        const loc = eventLocation(event!);
        if (loc) input.location = loc;
        if (raw.plan?.notes) input.notes = raw.plan.notes;
        const created: CalendarEvent = await calendar().createEvent(userId, username, input, { source: { app: "events", refId: eventId } });
        if (event!.status === "cancelled") {
          await calendar().setLinkedFields(userId, username, created.id, { cancelled: true }).catch(() => undefined);
        }
        return { calendarEventId: created.id, visibility: vis };
      };

      let link: EventCalendarLink | null = raw.calendar ?? null;
      if (response === "not-interested" || response === "dismissed") {
        if (link) {
          try {
            await calendar().deleteEvent(userId, username, link.calendarEventId);
          } catch (err) {
            if (!isMissingEntry(err)) throw err;
          }
          link = null;
        }
      } else {
        const addToCalendar = parsed.data.addToCalendar ?? response === "going";
        if (link) {
          try {
            const patch: Parameters<ReturnType<typeof calendar>["setLinkedFields"]>[3] = { type: visibility ?? link.visibility };
            if (resolvedPeople) patch.people = resolvedPeople;
            await calendar().setLinkedFields(userId, username, link.calendarEventId, patch);
            link = { calendarEventId: link.calendarEventId, visibility: visibility ?? link.visibility };
          } catch (err) {
            if (!isMissingEntry(err)) throw err;
            // Household deleted the entry: never silently recreate it unless explicitly asked to.
            link = null;
            if (parsed.data.addToCalendar === true) link = await createLinked();
          }
        } else if (addToCalendar) {
          link = await createLinked();
        }
      }

      await deps.update(recPath(userId, eventId), { response, respondedAt: now(), calendar: link });
      return service.getRecommendation(userId, eventId);
    },

    async updatePlan(userId: string, username: string, eventId: string, body: unknown): Promise<RecommendationItem> {
      const parsed = patchPlanSchema.safeParse(body);
      if (!parsed.success) {
        throw new EventsError(`Invalid plan: ${parsed.error.issues[0]?.message ?? "invalid"}`, 400);
      }
      const { occurrenceStart, notes, people, visibility } = parsed.data;
      const raw = await loadOne(userId, eventId);
      const event = parseJson<FfEvent>(raw.eventJson, "eventJson", eventId);
      if (!event) throw new EventsError("Event not found", 404);

      if (occurrenceStart !== undefined) {
        const t = Date.parse(occurrenceStart);
        const valid = t === Date.parse(event.schedule.start) || event.schedule.occurrences.some((o) => Date.parse(o.start) === t);
        if (!valid) throw new EventsError("occurrenceStart must match the event start or one of its occurrences", 400);
      }

      const plan: EventPlan = { ...(raw.plan ?? {}) };
      if (occurrenceStart !== undefined) plan.occurrenceStart = occurrenceStart;
      if (notes !== undefined) plan.notes = notes;
      if (people !== undefined) plan.people = people;

      const writes: Record<string, any> = { plan };
      const link = raw.calendar;
      if (link) {
        const patch: Parameters<ReturnType<typeof calendar>["setLinkedFields"]>[3] = {};
        if (occurrenceStart !== undefined) Object.assign(patch, calendarDates(event, occurrenceStart));
        if (notes !== undefined) patch.notes = notes;
        if (people !== undefined) patch.people = people;
        if (visibility !== undefined) patch.type = visibility;
        try {
          await calendar().setLinkedFields(userId, username, link.calendarEventId, patch);
          if (visibility !== undefined) writes.calendar = { calendarEventId: link.calendarEventId, visibility };
        } catch (err) {
          if (!isMissingEntry(err)) throw err;
          writes.calendar = null;
        }
      }
      await deps.update(recPath(userId, eventId), writes);
      return service.getRecommendation(userId, eventId);
    },

    // The household's own calendar entries as bare intervals (no titles); date range is compared by calendar date.
    async listBusy(userId: string, username: string, fromIso: string, toIso: string): Promise<BusyInterval[]> {
      const from = fromIso.slice(0, 10);
      const to = toIso.slice(0, 10);
      const all = await calendar().listEvents(userId, username);
      const out: BusyInterval[] = [];
      for (const e of all) {
        if (e.creatorId !== userId || e.cancelled) continue;
        if (e.endDate < from || e.startDate > to) continue;
        if (!e.startTime) {
          out.push({ start: e.startDate, end: e.endDate, allDay: true });
        } else {
          out.push({ start: `${e.startDate}T${e.startTime}`, end: `${e.endDate}T${e.endTime ?? e.startTime}`, allDay: false });
        }
      }
      return out.sort((a, b) => a.start.localeCompare(b.start));
    },
  };
  return service;
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
      async push(path, value) {
        await getFirebaseDb().ref(path).push(value);
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
  appendFeedback: (...args) => defaultService().appendFeedback(...args),
  appendResponseFeedback: (...args) => defaultService().appendResponseFeedback(...args),
  listFeedback: (...args) => defaultService().listFeedback(...args),
  getPreferences: (...args) => defaultService().getPreferences(...args),
  putPreferences: (...args) => defaultService().putPreferences(...args),
  deleteAllForHousehold: (...args) => defaultService().deleteAllForHousehold(...args),
  respond: (...args) => defaultService().respond(...args),
  updatePlan: (...args) => defaultService().updatePlan(...args),
  listBusy: (...args) => defaultService().listBusy(...args),
};
