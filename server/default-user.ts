import { userSettingsSchema } from "@shared/schema";
import { DEFAULT_VISIBLE_APP_IDS, DEFAULT_APP_ORDER } from "@shared/apps";
import type { UserData } from "./middleware";

/**
 * Seed data for a brand-new account. Settings come from the schema defaults so the
 * server cannot drift from them; only the app picker is seeded from the manifest.
 */
export function getDefaultUserData(clerkId: string, username: string): UserData {
  return {
    clerkId,
    username,
    settings: userSettingsSchema.parse({
      homeName: "",
      location: { city: "", country: "" },
      visibleApps: [...DEFAULT_VISIBLE_APP_IDS],
      appOrder: [...DEFAULT_APP_ORDER],
    }),
    people: [],
    events: [],
    connections: [],
    connectionRequests: [],
    notes: [],
    messages: [],
  };
}
