import { DEFAULT_VISIBLE_APP_IDS, DEFAULT_APP_ORDER } from "@shared/apps";
import type { UserData } from "./middleware";

/**
 * Seed data for a brand-new account. Settings are intentionally sparse: only the household
 * keys and the app list are stored; every other key is filled in on read.
 */
export function getDefaultUserData(clerkId: string, username: string): UserData {
  return {
    clerkId,
    username,
    // Sparse on purpose: defaults are applied on read by withSettingsDefaults.
    settings: {
      homeName: "",
      location: { city: "", country: "" },
      visibleApps: [...DEFAULT_VISIBLE_APP_IDS],
      appOrder: [...DEFAULT_APP_ORDER],
    } as UserData["settings"],
    people: [],
    events: [],
    connections: [],
    connectionRequests: [],
    notes: [],
    messages: [],
  };
}
