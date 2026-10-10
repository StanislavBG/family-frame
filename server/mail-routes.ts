import type { Express, Request, Response } from "express";
import { asyncHandler } from "./middleware";
import { mailService, MailError, type MailService } from "./mail-service";
import { markEmailsReadSchema } from "@shared/agent-data";
import { z } from "zod";
import { mailRehoster, type MailRehoster } from "./mail-rehost";

const rehostBodySchema = z.object({
  emailIds: z.array(z.string().min(1)).max(50).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

type MailHandler = (req: Request, res: Response, userId: string) => Promise<void>;

// Auth header check + MailError mapping; unexpected errors fall through to asyncHandler (500).
function mailHandler(fn: MailHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (error instanceof MailError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function registerMailRoutes(app: Express, service: MailService = mailService, rehoster: MailRehoster = mailRehoster): void {
  app.post("/api/mail/messages", mailHandler(async (req, res, userId) => {
    res.json(await service.upsertEmails(userId, req.body?.emails === undefined ? req.body : { emails: req.body.emails }));
  }));

  app.get("/api/mail/messages", mailHandler(async (req, res, userId) => {
    const limitRaw = queryString(req.query.limit);
    const unread = req.query.unread;
    res.json(await service.listEmails(userId, {
      limit: limitRaw === undefined ? undefined : Number(limitRaw),
      before: queryString(req.query.before),
      label: queryString(req.query.label),
      kind: queryString(req.query.kind),
      unreadOnly: unread === "1" || unread === "true",
      q: queryString(req.query.q),
      personId: queryString(req.query.personId),
    }));
  }));

  app.get("/api/mail/unread-count", mailHandler(async (_req, res, userId) => {
    res.json({ count: await service.unreadCount(userId) });
  }));

  app.post("/api/mail/messages/read", mailHandler(async (req, res, userId) => {
    const parsed = markEmailsReadSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue.path.join(".");
      res.status(400).json({ error: path ? `${path}: ${issue.message}` : issue.message });
      return;
    }
    res.json(await service.setRead(userId, parsed.data.ids, parsed.data.read ?? true));
  }));

  app.post("/api/mail/messages/rehost", mailHandler(async (req, res, userId) => {
    if (req.headers["x-ff-auth"] === "pat") {
      const scopes = ((req.headers["x-ff-scopes"] as string) || "").split(",");
      if (!scopes.includes("media:write")) {
        res.status(403).json({ error: "This token needs the media:write scope to rehost images" });
        return;
      }
    }
    const parsed = rehostBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue.path.join(".");
      res.status(400).json({ error: path ? `${path}: ${issue.message}` : issue.message });
      return;
    }
    res.json(await rehoster.rehostEmailImages(userId, parsed.data));
  }));

  app.get("/api/mail/messages/:id", mailHandler(async (req, res, userId) => {
    const email = await service.getEmail(userId, req.params.id);
    if (!email) {
      res.status(404).json({ error: "Email not found" });
      return;
    }
    res.json(email);
  }));

  app.delete("/api/mail/messages/:id", mailHandler(async (req, res, userId) => {
    if (!(await service.deleteEmail(userId, req.params.id))) {
      res.status(404).json({ error: "Email not found" });
      return;
    }
    res.status(204).end();
  }));
}
