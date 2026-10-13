import type { Express, Request, Response } from "express";
import { z, ZodError } from "zod";
import { asyncHandler } from "./middleware";
import { getUserData } from "./firebase";
import {
  householdInboxService,
  HouseholdInboxError,
  type HouseholdInboxService,
} from "./household-inbox-service";
import { buildInboxAddress, personSlug } from "@shared/household-inbox";
import { applyOrganized, type OrganizeDeps } from "./household-inbox-organize";
import { mailService } from "./mail-service";
import { timeSeriesService } from "./time-series-service";
import { datasetService } from "./dataset-service";

interface InboxRouteDeps {
  inboxAddress(): string | undefined;
  getPeople(userId: string): Promise<{ id: string; name: string }[]>;
}

const defaultDeps: InboxRouteDeps = {
  inboxAddress: () => process.env.HOUSEHOLD_INBOX_ADDRESS,
  getPeople: async (uid) => (await getUserData(uid))?.people ?? [],
};

const defaultOrganizeDeps: OrganizeDeps = {
  mail: mailService,
  series: timeSeriesService,
  datasets: datasetService,
  getPeople: defaultDeps.getPeople,
};

const enabledSchema = z.object({ enabled: z.boolean() });
const sourceSchema = z.object({
  email: z.string().email(),
  status: z.enum(["approved", "blocked"]),
});

type InboxHandler = (req: Request, res: Response, userId: string) => Promise<void>;

function handleError(res: Response, error: unknown): boolean {
  if (error instanceof HouseholdInboxError) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request", details: error.issues });
    return true;
  }
  return false;
}

// Browser-session only: 401 without a user, 403 for PAT / service callers.
function sessionHandler(fn: InboxHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.headers["x-ff-auth"] !== "session") {
      res.status(403).json({ error: "Household inbox requires a signed-in session" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  });
}

function isEmail(value: string | undefined): value is string {
  return value !== undefined && z.string().email().safeParse(value).success;
}

export function registerHouseholdInboxRoutes(
  app: Express,
  service: HouseholdInboxService = householdInboxService,
  deps: InboxRouteDeps = defaultDeps,
  organizeDeps: OrganizeDeps = defaultOrganizeDeps,
): void {
  async function payload(userId: string) {
    const base = deps.inboxAddress();
    if (!isEmail(base)) return { configured: false as const };
    const state = await service.getState(userId);
    const active = state.enabled && state.key !== null;
    const out: Record<string, unknown> = { configured: true, ...state };
    const people: { id: string; name: string; address: string }[] = [];
    if (active) {
      const key = state.key as string;
      out.address = buildInboxAddress(base, key);
      for (const person of await deps.getPeople(userId)) {
        const slug = personSlug(person.name);
        if (slug) people.push({ id: person.id, name: person.name, address: buildInboxAddress(base, key, slug) });
      }
    }
    out.people = people;
    return out;
  }

  app.get("/api/household/inbox", sessionHandler(async (_req, res, userId) => {
    res.json(await payload(userId));
  }));

  app.put("/api/household/inbox/enabled", sessionHandler(async (req, res, userId) => {
    const { enabled } = enabledSchema.parse(req.body);
    if (enabled) await service.enable(userId);
    else await service.disable(userId);
    res.json(await payload(userId));
  }));

  app.post("/api/household/inbox/rotate", sessionHandler(async (_req, res, userId) => {
    await service.rotate(userId);
    res.json(await payload(userId));
  }));

  app.put("/api/household/inbox/sources", sessionHandler(async (req, res, userId) => {
    const { email, status } = sourceSchema.parse(req.body);
    await service.setSourceStatus(userId, email, status);
    res.json(await payload(userId));
  }));

  app.put("/api/household/inbox/organize", sessionHandler(async (req, res, userId) => {
    const { enabled } = enabledSchema.parse(req.body);
    await service.setOrganize(userId, enabled);
    res.json(await payload(userId));
  }));

  app.post("/api/service/inbox/deliver", asyncHandler(async (req, res) => {
    if (req.headers["x-ff-auth"] !== "service") {
      res.status(403).json({ error: "Service token required" });
      return;
    }
    try {
      res.json(await service.deliver(req.body));
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  }));

  app.post("/api/service/inbox/households/:householdId/organized", asyncHandler(async (req, res) => {
    if (req.headers["x-ff-auth"] !== "service") {
      res.status(403).json({ error: "Service token required" });
      return;
    }
    try {
      const householdId = String(req.params.householdId);
      const state = await service.getState(householdId);
      if (!state.enabled || !state.organize.enabled) {
        res.status(404).json({ error: "Household not found" });
        return;
      }
      res.json(await applyOrganized(householdId, req.body, organizeDeps));
    } catch (error) {
      if (!handleError(res, error)) throw error;
    }
  }));
}
