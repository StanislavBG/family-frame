import type { Express, Request, Response } from "express";
import { calendarService, CalendarError } from "../calendar-service";
import { insertCalendarEventSchema } from "@shared/schema";

export function registerCalendarRoutes(app: Express): void {
  function calendarErrorResponse(res: Response, error: unknown, label: string) {
    if (error instanceof CalendarError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(label, error);
    res.status(500).json({ error: "Internal server error" });
  }

  app.get("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      res.json(await calendarService.listEvents(userId, username));
    } catch (error) {
      calendarErrorResponse(res, error, "Calendar events error:");
    }
  });

  app.post("/api/calendar/new-event", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parseResult = insertCalendarEventSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: "Invalid event data", details: parseResult.error.errors });
        return;
      }

      res.json(await calendarService.createEvent(userId, username, parseResult.data));
    } catch (error) {
      calendarErrorResponse(res, error, "Calendar create error:");
    }
  });

  app.put("/api/calendar/events/:eventId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { eventId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parseResult = insertCalendarEventSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: "Invalid event data", details: parseResult.error.errors });
        return;
      }

      res.json(await calendarService.updateEvent(userId, username, eventId, parseResult.data));
    } catch (error) {
      calendarErrorResponse(res, error, "Calendar update error:");
    }
  });

  app.delete("/api/calendar/events/:eventId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { eventId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await calendarService.deleteEvent(userId, username, eventId);
      res.json({ success: true });
    } catch (error) {
      calendarErrorResponse(res, error, "Calendar delete error:");
    }
  });
}
