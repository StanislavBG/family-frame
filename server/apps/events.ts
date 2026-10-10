import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { asyncHandler } from "../middleware";
import { eventsService, EventsError, type EventsService } from "../events-service";
import { householdProfileService, type HouseholdProfileService } from "../household-profile-service";
import { isAddressComplete } from "@shared/household";

type EventsHandler = (req: Request, res: Response, userId: string, username: string) => Promise<void>;

// Auth header check + EventsError/zod mapping; unexpected errors fall through to asyncHandler (500).
function eventsHandler(fn: EventsHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const username = (req.headers["x-clerk-username"] as string) || "user";
    try {
      await fn(req, res, userId, username);
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
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function queryDate(value: unknown, name: string): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new EventsError(`${name} must be YYYY-MM-DD`, 400);
  }
  return value;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new EventsError("limit must be a number", 400);
  return n;
}

export function registerEventsRoutes(
  app: Express,
  service: EventsService = eventsService,
  profiles: Pick<HouseholdProfileService, "getProfile"> = householdProfileService,
): void {
  app.get("/api/events/status", eventsHandler(async (_req, res, userId) => {
    const [profile, items, meta] = await Promise.all([
      profiles.getProfile(userId),
      service.listRecommendations(userId),
      service.getRunMeta(userId),
    ]);
    const counts = { new: 0, going: 0, interested: 0, changed: 0 };
    for (const item of items) {
      if (item.response === "new") counts.new++;
      else if (item.response === "going") counts.going++;
      else if (item.response === "interested") counts.interested++;
      if (item.hasUnseenUpdate) counts.changed++;
    }
    res.json({
      sharingEnabled: profile.eventsSharing.enabled,
      addressComplete: isAddressComplete(profile.address),
      lastPublishedAt: meta?.lastPublishedAt ?? null,
      counts,
    });
  }));

  app.get("/api/events/preferences", eventsHandler(async (_req, res, userId) => {
    res.json(await service.getPreferences(userId));
  }));

  app.put("/api/events/preferences", eventsHandler(async (req, res, userId) => {
    res.json(await service.putPreferences(userId, req.body));
  }));

  app.get("/api/events/feedback", eventsHandler(async (req, res, userId) => {
    res.json(await service.listFeedback(userId, {
      since: queryString(req.query.since),
      limit: queryNumber(req.query.limit),
    }));
  }));

  app.delete("/api/events/data", eventsHandler(async (_req, res, userId) => {
    await service.deleteAllForHousehold(userId);
    res.status(204).end();
  }));

  app.get("/api/events/items", eventsHandler(async (req, res, userId) => {
    res.json(await service.listRecommendations(userId, {
      from: queryDate(req.query.from, "from"),
      to: queryDate(req.query.to, "to"),
      includeHidden: req.query.include === "all",
    }));
  }));

  app.get("/api/events/items/:eventId", eventsHandler(async (req, res, userId) => {
    res.json(await service.getRecommendation(userId, req.params.eventId));
  }));

  app.post("/api/events/items/:eventId/response", eventsHandler(async (req, res, userId, username) => {
    res.json(await service.respond(userId, username, req.params.eventId, req.body));
  }));

  app.post("/api/events/items/:eventId/feedback", eventsHandler(async (req, res, userId) => {
    const signal = await service.appendFeedback(userId, req.params.eventId, req.body);
    res.json({ signal });
  }));

  app.patch("/api/events/items/:eventId/plan", eventsHandler(async (req, res, userId, username) => {
    res.json(await service.updatePlan(userId, username, req.params.eventId, req.body));
  }));

  app.post("/api/events/items/:eventId/seen", eventsHandler(async (req, res, userId) => {
    await service.markSeen(userId, req.params.eventId);
    res.status(204).end();
  }));
}
