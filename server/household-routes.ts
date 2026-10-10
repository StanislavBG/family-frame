import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { asyncHandler, getOrCreateUser } from "./middleware";
import { updateUserData } from "./firebase";
import { householdProfileService, HouseholdProfileError, type HouseholdProfileService } from "./household-profile-service";
import { householdAddressSchema, putEventsSharingSchema } from "@shared/household";

type SyncUserData = {
  getOrCreateUser: typeof getOrCreateUser;
  updateUserData: typeof updateUserData;
};

type HouseholdHandler = (req: Request, res: Response, userId: string) => Promise<void>;

// Browser-session only: 401 without a user, 403 for PAT / service callers.
function householdHandler(fn: HouseholdHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.headers["x-ff-auth"] !== "session") {
      res.status(403).json({ error: "Household profile requires a signed-in session" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (error instanceof HouseholdProfileError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request", details: error.issues });
        return;
      }
      throw error;
    }
  });
}

export function registerHouseholdRoutes(
  app: Express,
  service: HouseholdProfileService = householdProfileService,
  userDeps: SyncUserData = { getOrCreateUser, updateUserData },
): void {
  app.get("/api/household/profile", householdHandler(async (_req, res, userId) => {
    res.json(await service.getProfile(userId));
  }));

  app.put("/api/household/address", householdHandler(async (req, res, userId) => {
    const address = householdAddressSchema.parse(req.body);
    const profile = await service.putAddress(userId, address);
    // Keep city/country in one place: weather and connections read settings.location.
    const username = (req.headers["x-clerk-username"] as string) || "user";
    const userData = await userDeps.getOrCreateUser(userId, username);
    await userDeps.updateUserData(userId, {
      settings: { ...userData.settings, location: { city: address.city, country: address.country } },
    });
    res.json(profile);
  }));

  app.put("/api/household/events-sharing", householdHandler(async (req, res, userId) => {
    const { enabled } = putEventsSharingSchema.parse(req.body);
    res.json(await service.setEventsSharing(userId, enabled));
  }));
}
