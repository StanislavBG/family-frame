import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getUserData, setUserData } from "./firebase";
import type {
  CalendarEvent,
  Person,
  UserSettings,
  ConnectionRequest,
  Note,
  Message,
} from "@shared/schema";
import { PhotoSource } from "@shared/schema";

export interface UserData {
  clerkId: string;
  username: string;
  settings: UserSettings;
  people: Person[];
  events: CalendarEvent[];
  connections: string[];
  connectionRequests: ConnectionRequest[];
  googleTokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  notes: Note[];
  messages: Message[];
}

export interface AuthContext {
  userId: string;
  username: string;
  userData: UserData;
}

function getDefaultUserData(clerkId: string, username: string): UserData {
  return {
    clerkId,
    username,
    settings: {
      homeName: "",
      location: { city: "", country: "" },
      temperatureUnit: "celsius",
      timeFormat: "24h",
      clockStyle: "analog",
      googlePhotosConnected: false,
      selectedAlbums: [],
      selectedPhotos: [],
      photoSource: PhotoSource.GOOGLE_PHOTOS,
      photoInterval: 10,
      radioEnabled: false,
      radioVolume: 50,
      radioStation: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac",
      trackedStocks: ["DJI", "BTC"],
      babyAgeMonths: 12,
      customPlaylists: [],
      tvVolume: 50,
      // Screensaver settings
      screensaverEnabled: true,
      screensaverDelay: 5,
      screensaverMode: "cycle",
      // Sleep mode settings
      sleepModeEnabled: false,
      sleepStartTime: "22:00",
      sleepEndTime: "07:00",
      sleepDimLevel: 20,
      // Weather alerts
      weatherAlertsEnabled: true,
      // Dashboard settings
      dashboardLayout: "default",
      babySongsFavorites: [],
      babySongsShuffleEnabled: false,
    },
    people: [],
    events: [],
    connections: [],
    connectionRequests: [],
    notes: [],
    messages: [],
  };
}

/**
 * Get or create user data in Firebase.
 * If user doesn't exist, creates with default settings.
 */
export async function getOrCreateUser(clerkId: string, username: string): Promise<UserData> {
  let userData = await getUserData(clerkId);
  if (!userData) {
    userData = getDefaultUserData(clerkId, username);
    await setUserData(clerkId, userData);
  }
  return userData;
}

/**
 * Wraps an async route handler with error handling.
 * Catches errors and returns 500 with consistent error format.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error(`[${req.method} ${req.path}] error:`, error);
      res.status(500).json({ error: "Internal server error" });
    });
  };
}

/**
 * Normalize Firebase array/object data to array.
 * Firebase sometimes converts arrays to objects with numeric keys.
 */
export function toArray<T>(value: T[] | Record<string, T> | undefined | null): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}
