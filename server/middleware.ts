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
import { getDefaultUserData } from "./default-user";

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
