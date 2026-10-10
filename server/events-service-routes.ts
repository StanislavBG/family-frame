import type { Express, Request, Response } from "express";
import { z, ZodError } from "zod";
import { asyncHandler } from "./middleware";
import { eventsService, EventsError, type EventsService } from "./events-service";
import { householdProfileService, type HouseholdProfileService } from "./household-profile-service";
import { getUserData } from "./firebase";
import { aggregatePreferences } from "@shared/events-preferences";

const BUSY_WINDOW_DAYS = 90;
const LEARNED_FEEDBACK_LIMIT = 5000;
const MS_PER_DAY = 86_400_000;

export interface EventsServiceRoutesDeps {
  events: EventsService;
  profiles: Pick<HouseholdProfileService, "listSharingHouseholds">;
  getUserData: (userId: string) => Promise<any>;
  now?: () => Date;
}

const runBodySchema = z.object({
  runId: z.string().min(1),
  kind: z.enum(["discover", "refresh"]),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  stats: z.record(z.string(), z.number()),
});

// Whole years from a YYYY-MM-DD birthday as of todayIso; people without a valid birthday are skipped.
export function memberAgesFrom(people: Array<{ birthday?: string }> | undefined, todayIso: string): number[] {
  const today = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso);
  if (!today || !Array.isArray(people)) return [];
  const [ty, tm, td] = [Number(today[1]), Number(today[2]), Number(today[3])];
  const ages: number[] = [];
  for (const person of people) {
    const m = typeof person?.birthday === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.birthday) : null;
    if (!m) continue;
    const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age--;
    if (age >= 0) ages.push(age);
  }
  return ages;
}

export function registerEventsServiceRoutes(app: Express, deps: Partial<EventsServiceRoutesDeps> = {}): void {
  const events = deps.events ?? eventsService;
  const profiles = deps.profiles ?? householdProfileService;
  const loadUser = deps.getUserData ?? getUserData;
  const nowDate = () => (deps.now ? deps.now() : new Date());

  type Ctx = { userId: string; username: string; userData: any };
  type Handler = (req: Request, res: Response, ctx: Ctx) => Promise<void>;

  const guarded = (fn: (req: Request, res: Response) => Promise<void>) =>
    asyncHandler(async (req, res) => {
      if (req.headers["x-ff-auth"] !== "service") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      try {
        await fn(req, res);
      } catch (error) {
        if (error instanceof EventsError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        if (error instanceof ZodError) {
          res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
          return;
        }
        throw error;
      }
    });

  // Consent is re-checked on every per-household route; anything not currently sharing is a plain 404.
  const household = (fn: Handler) =>
    guarded(async (req, res) => {
      const householdId = req.params.householdId;
      const sharing = (await profiles.listSharingHouseholds()).find((h) => h.userId === householdId);
      if (!sharing) {
        res.status(404).json({ error: "Household not found" });
        return;
      }
      const userData = (await loadUser(householdId)) ?? {};
      await fn(req, res, { userId: householdId, username: userData.username ?? "user", userData });
    });

  app.get("/api/service/events/households", guarded(async (_req, res) => {
    const sharing = await profiles.listSharingHouseholds();
    const today = nowDate().toISOString().slice(0, 10);
    const households = await Promise.all(sharing.map(async (h) => {
      const userData = (await loadUser(h.userId)) ?? {};
      const [preferences, feedback, meta] = await Promise.all([
        events.getPreferences(h.userId),
        events.listFeedback(h.userId, { limit: LEARNED_FEEDBACK_LIMIT }),
        events.getRunMeta(h.userId),
      ]);
      const item: Record<string, unknown> = { householdId: h.userId };
      if (userData.settings?.homeName) item.homeName = userData.settings.homeName;
      item.address = h.address;
      if (h.address.timezone) item.timezone = h.address.timezone;
      item.memberAges = memberAgesFrom(userData.people, today);
      item.preferences = preferences;
      item.learned = aggregatePreferences(feedback, preferences, { now: nowDate() });
      item.lastPublishedAt = meta?.lastPublishedAt ?? null;
      item.consentVersion = h.eventsSharing.consentVersion ?? null;
      return item;
    }));
    res.json({ households });
  }));

  app.get("/api/service/events/households/:householdId/state", household(async (req, res, { userId, username }) => {
    const since = typeof req.query.feedbackSince === "string" && req.query.feedbackSince ? req.query.feedbackSince : undefined;
    if (since !== undefined && Number.isNaN(Date.parse(since))) {
      throw new EventsError("feedbackSince must be an ISO timestamp", 400);
    }
    const now = nowDate();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + BUSY_WINDOW_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
    const [items, busy, feedback, preferences, allFeedback] = await Promise.all([
      events.listRecommendations(userId, { includeHidden: true }),
      events.listBusy(userId, username, from, to),
      events.listFeedback(userId, { since, limit: LEARNED_FEEDBACK_LIMIT }),
      events.getPreferences(userId),
      events.listFeedback(userId, { limit: LEARNED_FEEDBACK_LIMIT }),
    ]);
    res.json({
      householdId: userId,
      recommendations: items.map((i) => ({
        eventId: i.eventId,
        fingerprint: i.event.fingerprint,
        title: i.event.title,
        start: i.event.schedule.start,
        end: i.event.schedule.end,
        category: i.event.category,
        status: i.event.status,
        response: i.response,
        feedback: i.feedback ?? null,
        calendarLinked: !!i.calendar,
        recommendedAt: i.recommendedAt,
        withdrawn: i.withdrawn,
      })),
      busy,
      feedback,
      preferences,
      learned: aggregatePreferences(allFeedback, preferences, { now }),
    });
  }));

  app.put("/api/service/events/households/:householdId/recommendations", household(async (req, res, { userId }) => {
    res.json(await events.upsertRecommendations(userId, req.body));
  }));

  app.delete("/api/service/events/households/:householdId/recommendations/:eventId", household(async (req, res, { userId }) => {
    res.json(await events.withdraw(userId, req.params.eventId));
  }));

  app.post("/api/service/events/households/:householdId/runs", household(async (req, res, { userId }) => {
    const parsed = runBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid run: ${parsed.error.issues[0]?.message ?? "invalid"}` });
      return;
    }
    res.json(await events.recordRun(userId, parsed.data));
  }));
}
