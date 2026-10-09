import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  APP_IDS,
  getAppManifest,
  moveAppInOrder,
  normalizeAppOrder,
  resolveAppLayout,
  setAppEnabled,
  type AppId,
} from "@shared/apps";
import { asyncHandler, getOrCreateUser } from "./middleware";
import { updateUserData } from "./firebase";

export interface AppVisibilityDeps {
  getOrCreateUser: typeof getOrCreateUser;
  updateUserData: typeof updateUserData;
}

const enabledBodySchema = z.object({ enabled: z.boolean() }).strict();
const moveBodySchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

// appId is only ever compared against APP_IDS, never used as a Firebase path segment.
function parseMovableAppId(raw: unknown): AppId | null {
  const id = (APP_IDS as readonly string[]).find((a) => a === raw) as AppId | undefined;
  if (!id || getAppManifest(id).fixed) return null;
  return id;
}

export function registerAppVisibilityRoutes(
  app: Express,
  deps: AppVisibilityDeps = { getOrCreateUser, updateUserData },
): void {
  app.put("/api/settings/apps/:appId", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = (req.headers["x-clerk-username"] as string) || "user";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const appId = parseMovableAppId(req.params.appId);
    if (!appId) {
      res.status(400).json({ error: "Unknown or fixed app" });
      return;
    }
    const parsed = enabledBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const userData = await deps.getOrCreateUser(userId, username);
    const settings = userData.settings;
    const visibleApps = setAppEnabled(settings?.visibleApps, appId, parsed.data.enabled);
    await deps.updateUserData(userId, { settings: { ...settings, visibleApps } });
    res.json({ visibleApps, appOrder: normalizeAppOrder(settings?.appOrder) });
  }));

  app.post("/api/settings/apps/:appId/move", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = (req.headers["x-clerk-username"] as string) || "user";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const appId = parseMovableAppId(req.params.appId);
    if (!appId) {
      res.status(400).json({ error: "Unknown or fixed app" });
      return;
    }
    const parsed = moveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const userData = await deps.getOrCreateUser(userId, username);
    const settings = userData.settings;
    const appOrder = moveAppInOrder(settings?.appOrder, appId, parsed.data.direction);
    await deps.updateUserData(userId, { settings: { ...settings, appOrder } });
    res.json({ visibleApps: resolveAppLayout(settings).enabledIds, appOrder });
  }));
}
