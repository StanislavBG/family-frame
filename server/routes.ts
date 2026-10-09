import type { Express, Request, Response } from "express";
import { registerMcpRoutes } from "./mcp";
import { registerShoppingRoutes } from "./apps/shopping";
import { registerNotepadRoutes } from "./apps/notepad";
import { registerMessagesRoutes } from "./apps/messages";
import { registerChoresRoutes } from "./apps/chores";
import { registerRecipesRoutes } from "./apps/recipes";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { getUserData, setUserData, updateUserData, getUserByUsername } from "./firebase";
import { asyncHandler, getOrCreateUser, toArray, type UserData } from "./middleware";
import { z } from "zod";
import { calendarService, CalendarError } from "./calendar-service";
import { createApiToken, listApiTokens, revokeApiToken, firebaseTokenStore, ApiTokenError, API_TOKEN_SCOPES } from "./api-tokens";

const OAUTH_NONCE_COOKIE = "ff_oauth_nonce";
const OAUTH_NONCE_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_NOT_CONFIGURED = { error: "Google Photos sign-in not configured" };
import { getWeather, reverseGeocode, geocodeCity } from "./weather";
import { getGoogleAuthUrl, exchangeCodeForTokens, refreshAccessToken, createPickerSession, getPickerSession, getPickedMediaItems, deletePickerSession, refreshPickerPhotoUrl } from "./google-photos";
import { isAllowedGooglePhotoUrl, isAllowedStreamUrl } from "./url-guards";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAppBaseUrl } from "./config";
import { photoCache } from "./photo-cache";
import type {
  CalendarEvent,
  Person,
  UserSettings,
  ConnectedUser,
  ConnectionRequest,
  InsertCalendarEvent,
  InsertPerson,
  GooglePhotoItem,
  StoredPhoto,
} from "@shared/schema";
import { insertCalendarEventSchema, insertPersonSchema, ConnectionStatus, PhotoSource, EventType, updateUserSettingsSchema, updatePersonSchema, isValidConnectionUserId, createPlaylistSchema, updatePlaylistSchema } from "@shared/schema";

// Detect if running in production deployment
const isProduction = process.env.REPLIT_DEPLOYMENT === "1";

// Get Clerk publishable key - check all possible env var names
function getClerkPublishableKey(): string {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY 
    || process.env.PUBLISHABLE_KEY_PROD 
    || process.env.PUBLISHABLE_KEY_DEV 
    || "";
  
  if (!key) {
    console.error("[Clerk] No publishable key found in environment variables");
  }
  
  return key;
}


// UserData interface and getOrCreateUser moved to middleware.ts

async function getValidGoogleToken(userData: UserData): Promise<string | null> {
  if (!userData.googleTokens) {
    return null;
  }

  const now = Date.now();
  const expiresAt = userData.googleTokens.expiresAt;

  // Return current token if still valid (with 60s buffer)
  if (now < expiresAt - 60000) {
    return userData.googleTokens.accessToken;
  }

  const refreshed = await refreshAccessToken(userData.googleTokens.refreshToken);
  if (!refreshed) {
    return null;
  }

  userData.googleTokens.accessToken = refreshed.accessToken;
  userData.googleTokens.expiresAt = refreshed.expiresAt;
  await updateUserData(userData.clerkId, { googleTokens: userData.googleTokens });

  return refreshed.accessToken;
}

const FETCH_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
const PIXABAY_CACHE_TTL_MS = 10 * 60 * 1000;
const PIXABAY_MAX_PER_PAGE = 50;

// Cache an async computation for ms; concurrent callers share one in-flight run, failures aren't cached.
function memoTTL<T>(fn: () => Promise<T>, ms: number): () => Promise<T> {
  let cached: { value: Promise<T>; expires: number } | null = null;
  return () => {
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = fn();
    cached = { value, expires: Date.now() + ms };
    value.catch(() => { if (cached?.value === value) cached = null; });
    return value;
  };
}

// Status-only health probe: always release the body so no stream stays open.
async function discardBody(response: globalThis.Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerMcpRoutes(app);

  // Config endpoint - provides environment-specific settings to frontend
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      clerkPublishableKey: getClerkPublishableKey(),
    });
  });

  // Weather by coordinates in path (used by geolocation-based queries)
  app.get("/api/weather/coords/:lat/:lon", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.params.lat);
      const lon = parseFloat(req.params.lon);

      if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({ error: "Invalid coordinates" });
        return;
      }

      const [weatherData, location] = await Promise.all([
        getWeather(lat, lon),
        reverseGeocode(lat, lon),
      ]);

      if (!weatherData) {
        res.status(500).json({ error: "Failed to fetch weather data" });
        return;
      }

      res.json({
        ...weatherData,
        location: location || { city: "Unknown", country: "Unknown" },
      });
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/weather/:city/:country", async (req: Request, res: Response) => {
    try {
      const { city, country } = req.params;

      const geoResult = await geocodeCity(city, country);
      if (!geoResult) {
        res.status(404).json({ error: "Location not found" });
        return;
      }

      const weatherData = await getWeather(geoResult.latitude, geoResult.longitude);
      if (!weatherData) {
        res.status(500).json({ error: "Failed to fetch weather data" });
        return;
      }

      res.json({
        ...weatherData,
        location: { city: geoResult.name, country: geoResult.country },
      });
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/settings", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    res.json(userData.settings);
  }));

  app.patch("/api/settings", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = updateUserSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const updatedSettings = { ...userData.settings, ...parsed.data };

    await updateUserData(userId, { settings: updatedSettings });

    res.json(updatedSettings);
  }));

  // API token management: browser (Clerk) sessions only, never PAT-authenticated requests
  const createTokenSchema = z.object({
    name: z.string().trim().min(1).max(60),
    scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
  });

  function getTokenManagerId(req: Request, res: Response): string | null {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    if (req.headers["x-ff-auth"] === "pat") {
      res.status(403).json({ error: "API tokens cannot manage tokens" });
      return null;
    }
    return userId;
  }

  app.get("/api/tokens", asyncHandler(async (req: Request, res: Response) => {
    const userId = getTokenManagerId(req, res);
    if (!userId) return;
    res.json(await listApiTokens(firebaseTokenStore, userId));
  }));

  app.post("/api/tokens/new", asyncHandler(async (req: Request, res: Response) => {
    const userId = getTokenManagerId(req, res);
    if (!userId) return;

    const parseResult = createTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid token data", details: parseResult.error.errors });
      return;
    }

    try {
      const { token, record } = await createApiToken(firebaseTokenStore, userId, parseResult.data.name, parseResult.data.scopes);
      res.json({ token, record });
    } catch (err) {
      if (err instanceof ApiTokenError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }));

  app.delete("/api/tokens/:id", asyncHandler(async (req: Request, res: Response) => {
    const userId = getTokenManagerId(req, res);
    if (!userId) return;
    const revoked = await revokeApiToken(firebaseTokenStore, userId, req.params.id);
    if (!revoked) {
      res.status(404).json({ error: "Token not found" });
      return;
    }
    res.json({ success: true });
  }));

  app.get("/api/people/list", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    res.json(userData.people || []);
  }));

  app.post("/api/people/new", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parseResult = insertPersonSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid person data", details: parseResult.error.errors });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const newPerson: Person = {
      id: randomUUID(),
      ...parseResult.data,
    };

    const updatedPeople = [...(userData.people || []), newPerson];
    await updateUserData(userId, { people: updatedPeople });

    res.json(newPerson);
  }));

  app.patch("/api/people/:personId", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";
    const { personId } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // An empty birthday means "clear it"
    const body = req.body && typeof req.body === "object" ? { ...req.body } : req.body;
    const clearBirthday = body && body.birthday === "";
    if (clearBirthday) delete body.birthday;

    const parsed = updatePersonSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid person" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    if (!(userData.people || []).some((p) => p.id === personId)) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    const updatedPeople = (userData.people || []).map((p) => {
      if (p.id === personId) {
        const merged = { ...p, ...parsed.data };
        if (clearBirthday) delete merged.birthday;
        return merged;
      }
      return p;
    });

    await updateUserData(userId, { people: updatedPeople });

    const updatedPerson = updatedPeople.find((p) => p.id === personId);
    res.json(updatedPerson);
  }));

  app.delete("/api/people/:personId", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";
    const { personId } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const updatedPeople = (userData.people || []).filter((p) => p.id !== personId);

    const updatedEvents = (userData.events || []).map((event) => ({
      ...event,
      people: event.people.filter((id) => id !== personId),
    }));

    await updateUserData(userId, { people: updatedPeople, events: updatedEvents });

    res.json({ success: true });
  }));

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

  // Get accepted connections only
  app.get("/api/connections", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const connections: ConnectedUser[] = [];

    // Use toArray helper to normalize Firebase data
    const connectionIds = toArray<string>(userData.connections);

    for (const connectedUserId of connectionIds) {
      const connectedUserData = await getUserData(connectedUserId);
      if (connectedUserData) {
        connections.push({
          id: connectedUserId,
          username: connectedUserData.username,
          homeName: connectedUserData.settings?.homeName,
          location: connectedUserData.settings?.location,
          connectedAt: new Date().toISOString(),
        });
      }
    }

    res.json(connections);
  }));

  // Get pending connection requests (incoming requests to current user)
  app.get("/api/connections/requests", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);

    // Use toArray helper to normalize Firebase data
    const connectionRequests = toArray<ConnectionRequest>(userData.connectionRequests);

    const pendingRequests = connectionRequests.filter(
      (r: ConnectionRequest) => r.toUserId === userId && r.status === ConnectionStatus.PENDING
    );

    res.json(pendingRequests);
  }));

  // Get sent connection requests (outgoing requests from current user)
  app.get("/api/connections/sent", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);

    // Use toArray helper to normalize Firebase data
    const connectionRequests = toArray<ConnectionRequest>(userData.connectionRequests);

    const sentRequests = connectionRequests.filter(
      (r: ConnectionRequest) => r.fromUserId === userId && r.status === ConnectionStatus.PENDING
    );

    res.json(sentRequests);
  }));

  // Send a connection request (creates pending request)
  app.post("/api/connections", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { username: targetUsername } = req.body;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!targetUsername) {
        res.status(400).json({ error: "Username is required" });
        return;
      }

      const targetUser = await getUserByUsername(targetUsername);
      if (!targetUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (targetUser.clerkId === userId) {
        res.status(400).json({ error: "Cannot connect to yourself" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Check if already connected
      if (userData.connections?.includes(targetUser.clerkId)) {
        res.status(400).json({ error: "Already connected" });
        return;
      }

      // Check if there's already a pending request
      const existingRequest = (userData.connectionRequests || []).find(
        (r: ConnectionRequest) => 
          (r.fromUserId === userId && r.toUserId === targetUser.clerkId && r.status === ConnectionStatus.PENDING) ||
          (r.fromUserId === targetUser.clerkId && r.toUserId === userId && r.status === ConnectionStatus.PENDING)
      );
      if (existingRequest) {
        res.status(400).json({ error: "Connection request already pending" });
        return;
      }

      // Create the connection request
      const request: ConnectionRequest = {
        id: randomUUID(),
        fromUserId: userId,
        fromUsername: username,
        toUserId: targetUser.clerkId,
        toUsername: targetUser.data.username,
        status: ConnectionStatus.PENDING,
        createdAt: new Date().toISOString(),
      };

      // Add to sender's requests
      const senderRequests = [...(userData.connectionRequests || []), request];
      await updateUserData(userId, { connectionRequests: senderRequests });

      // Add to receiver's requests
      const targetUserData = targetUser.data;
      const receiverRequests = [...(targetUserData.connectionRequests || []), request];
      await updateUserData(targetUser.clerkId, { connectionRequests: receiverRequests });

      res.json(request);
    } catch (error) {
      console.error("Connection request error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Accept a connection request
  app.post("/api/connections/requests/:requestId/accept", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { requestId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const request = (userData.connectionRequests || []).find(
        (r: ConnectionRequest) => r.id === requestId && r.toUserId === userId && r.status === ConnectionStatus.PENDING
      );

      if (!request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      // Update request status in receiver's data
      const updatedReceiverRequests = (userData.connectionRequests || []).map((r: ConnectionRequest) =>
        r.id === requestId ? { ...r, status: ConnectionStatus.ACCEPTED, respondedAt: new Date().toISOString() } : r
      );
      const updatedReceiverConnections = [...(userData.connections || []), request.fromUserId];
      await updateUserData(userId, { 
        connectionRequests: updatedReceiverRequests,
        connections: updatedReceiverConnections
      });

      // Update request status in sender's data
      const senderData = await getUserData(request.fromUserId);
      if (senderData) {
        const updatedSenderRequests = (senderData.connectionRequests || []).map((r: ConnectionRequest) =>
          r.id === requestId ? { ...r, status: ConnectionStatus.ACCEPTED, respondedAt: new Date().toISOString() } : r
        );
        const updatedSenderConnections = [...(senderData.connections || []), userId];
        await updateUserData(request.fromUserId, { 
          connectionRequests: updatedSenderRequests,
          connections: updatedSenderConnections
        });
      }

      res.json({ success: true, message: "Connection accepted" });
    } catch (error) {
      console.error("Accept connection error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reject a connection request
  app.post("/api/connections/requests/:requestId/reject", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { requestId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const request = (userData.connectionRequests || []).find(
        (r: ConnectionRequest) => r.id === requestId && r.toUserId === userId && r.status === ConnectionStatus.PENDING
      );

      if (!request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }

      // Update request status in receiver's data
      const updatedReceiverRequests = (userData.connectionRequests || []).map((r: ConnectionRequest) =>
        r.id === requestId ? { ...r, status: ConnectionStatus.REJECTED, respondedAt: new Date().toISOString() } : r
      );
      await updateUserData(userId, { connectionRequests: updatedReceiverRequests });

      // Update request status in sender's data
      const senderData = await getUserData(request.fromUserId);
      if (senderData) {
        const updatedSenderRequests = (senderData.connectionRequests || []).map((r: ConnectionRequest) =>
          r.id === requestId ? { ...r, status: ConnectionStatus.REJECTED, respondedAt: new Date().toISOString() } : r
        );
        await updateUserData(request.fromUserId, { connectionRequests: updatedSenderRequests });
      }

      res.json({ success: true, message: "Connection rejected" });
    } catch (error) {
      console.error("Reject connection error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Remove an accepted connection
  app.delete("/api/connections/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { userId: targetUserId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!isValidConnectionUserId(targetUserId)) {
        res.status(400).json({ error: "Invalid user id" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      if (!(userData.connections || []).includes(targetUserId)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      const updatedConnections = (userData.connections || []).filter((id) => id !== targetUserId);
      await updateUserData(userId, { connections: updatedConnections });

      const targetUserData = await getUserData(targetUserId);
      if (targetUserData) {
        const targetUpdatedConnections = (targetUserData.connections || []).filter((id: string) => id !== userId);
        await updateUserData(targetUserId, { connections: targetUpdatedConnections });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Connection delete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get connections with weather data for home dashboard
  app.get("/api/connections/weather", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const connectionsWithWeather: Array<{
      id: string;
      recipientId: string;
      recipientName: string;
      recipientHomeName?: string;
      weather?: {
        current: { temperature: number; weatherCode: number; isDay: boolean };
        location: { city: string; country: string };
      };
      timezone?: string;
    }> = [];

    // Use toArray helper to normalize Firebase data
    const connectionIds = toArray<string>(userData.connections);

    const entries = await Promise.all(connectionIds.map(async (connectedUserId) => {
      const connectedUserData = await getUserData(connectedUserId);
      if (!connectedUserData) return null;
      const entry: typeof connectionsWithWeather[0] = {
        id: connectedUserId,
        recipientId: connectedUserId,
        recipientName: connectedUserData.username,
        recipientHomeName: connectedUserData.settings?.homeName,
      };

      // Get weather for their location if set
      if (connectedUserData.settings?.location?.city && connectedUserData.settings?.location?.country) {
        try {
          // First geocode the city to get coordinates
          const geoResult = await geocodeCity(
            connectedUserData.settings.location.city,
            connectedUserData.settings.location.country
          );
          if (geoResult) {
            const weatherData = await getWeather(geoResult.latitude, geoResult.longitude);
            if (weatherData) {
              entry.weather = {
                current: {
                  temperature: weatherData.current.temperature,
                  weatherCode: weatherData.current.weatherCode,
                  isDay: weatherData.current.isDay,
                },
                location: {
                  city: connectedUserData.settings.location.city,
                  country: connectedUserData.settings.location.country,
                },
              };
              entry.timezone = weatherData.timezone;
            }
          }
        } catch {
          // Weather fetch failed for connected user
        }
      }
      return entry;
    }));
    for (const entry of entries) {
      if (entry) connectionsWithWeather.push(entry);
    }

    res.json(connectionsWithWeather);
  }));

  // Media stream proxy - proxies streams through server to bypass geo-restrictions
  // Handles both HLS manifests (.m3u8) and direct media streams
  // SECURITY: Only allows specific Bulgarian streaming domains
  const ALLOWED_STREAM_DOMAINS = [
    // Bulgarian TV streaming
    "bss.neterra.tv",
    "bss1.neterra.tv",
    "live.ecomservice.bg",
    "live.cdn.bg",
    "cdn.bweb.bg",
    "tv.bnt.bg",
    "tv.nova.bg",
    "stream.btv.bg",
    "hls.btv.bg",
    "live.btv.bg",
    "100automoto.tv",
    "restr2.bgtv.bg",
    "bgtv.bg",
    "viamotionhsi.netplus.ch",
    "cdn.sstv.bg",
    "hls.sstv.bg",
    "stream.city.bg",
    "tv7.bg",
    "kanal3.bg",
    "europaplus.bg",
    // Bulgarian Radio streaming
    "stream80.metacast.eu",
    "stream81.metacast.eu",
    "stream.metacast.eu",
    "metacast.eu",
    "stream.bnr.bg",
    "bnr.bg",
    "streamer.atlantis.bg",
    "live.radiofresh.bg",
    "play.global.audio",
    "streams.radioenergy.bg",
    "stream.bgradio.bg",
    "bgradio.bg",
    // IPTV playlist sources
    "iptv-org.github.io",
    "i.mjh.nz",
  ];

  const MAX_STREAM_REDIRECTS = 3;

  class DisallowedRedirectError extends Error {}

  // Fetch with manual redirects; every hop must pass isAllowedStreamUrl.
  async function fetchFollowingAllowed(
    startUrl: string,
    hosts: readonly string[],
    init: RequestInit,
  ): Promise<globalThis.Response> {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_STREAM_REDIRECTS; hop++) {
      const response = await fetch(current, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init, redirect: "manual" });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) return response;
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        throw new DisallowedRedirectError("Invalid redirect location");
      }
      if (!isAllowedStreamUrl(next, hosts)) {
        throw new DisallowedRedirectError("Redirect target not allowed");
      }
      current = next;
    }
    throw new DisallowedRedirectError("Too many redirects");
  }

  app.get("/api/media/proxy", async (req: Request, res: Response) => {
    try {
      const streamUrl = req.query.url as string;
      
      if (!streamUrl) {
        res.status(400).json({ error: "Missing stream URL" });
        return;
      }

      // Validate URL format
      let url: URL;
      try {
        url = new URL(streamUrl);
      } catch {
        res.status(400).json({ error: "Invalid URL format" });
        return;
      }

      // Only allow HTTP/HTTPS protocols
      if (!["http:", "https:"].includes(url.protocol)) {
        res.status(400).json({ error: "Only HTTP/HTTPS URLs allowed" });
        return;
      }

      // SECURITY: Only allow specific Bulgarian streaming domains
      const hostname = url.hostname.toLowerCase();
      if (!ALLOWED_STREAM_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain))) {
        console.warn(`Media proxy blocked: ${hostname} not in allowlist`);
        res.status(403).json({ error: "Stream domain not allowed" });
        return;
      }

      // Fetch the stream with headers that mimic a Bulgarian client
      const upstream = new AbortController();
      res.on("close", () => upstream.abort());

      const response = await fetchFollowingAllowed(streamUrl, ALLOWED_STREAM_DOMAINS, {
        signal: upstream.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": req.headers.accept || "*/*",
          "Accept-Language": "bg-BG,bg;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": url.origin,
          "Referer": url.origin + "/",
          ...(req.headers.range ? { "Range": req.headers.range as string } : {}),
        },
      });

      if (!response.ok) {
        console.error(`Media proxy error: ${response.status} for ${streamUrl}`);
        res.status(response.status).json({ error: `Upstream error: ${response.status}` });
        return;
      }

      const contentType = response.headers.get("Content-Type") || "";
      const isM3u8 = streamUrl.includes(".m3u8") || streamUrl.includes(".m3u") || contentType.includes("mpegurl");

      // For HLS manifests, rewrite URLs to go through proxy
      if (isM3u8) {
        const content = await response.text();
        const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf("/") + 1);
        
        // Rewrite relative URLs in the manifest to go through our proxy
        const rewrittenContent = content.split("\n").map(line => {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (trimmed.startsWith("#") || trimmed === "") {
            // But check for URI= attributes in EXT tags
            if (trimmed.includes("URI=")) {
              return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullUrl = uri.startsWith("http") ? uri : baseUrl + uri;
                return `URI="/api/media/proxy?url=${encodeURIComponent(fullUrl)}"`;
              });
            }
            return line;
          }
          // This is likely a URL
          const fullUrl = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
          return `/api/media/proxy?url=${encodeURIComponent(fullUrl)}`;
        }).join("\n");

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.send(rewrittenContent);
        return;
      }

      // For regular media streams, pipe through
      if (!response.body) {
        res.status(502).json({ error: "No response body" });
        return;
      }

      // Set appropriate headers
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      if (response.headers.get("Content-Length")) {
        res.setHeader("Content-Length", response.headers.get("Content-Length")!);
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");

      // Pipe with backpressure; aborting upstream on client close cancels the body
      await pipeline(Readable.fromWeb(response.body as any), res).catch(() => {
        // premature close / upstream abort: expected when the client disconnects
      });
    } catch (error) {
      if (error instanceof DisallowedRedirectError) {
        console.warn(`Media proxy blocked redirect: ${error.message}`);
      } else {
        console.error("Media proxy error:", error);
      }
      if (!res.headersSent) {
        res.status(502).json({ error: "Stream error" });
      }
    }
  });

  // Radio stations organized by category (countries + genres) with icons
    interface StationConfig {
      name: string;
      url: string;
      fallbackUrls?: string[];
      logo?: string;
    }

    interface CategoryConfig {
      icon: string;
      stations: StationConfig[];
    }

    const stationsByCategory: Record<string, CategoryConfig> = {
      // Country categories
      "Bulgaria": {
        icon: "🇧🇬",
        stations: [
          {
            name: "BG Radio",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_L.aac",
            ],
          },
          {
            name: "Radio Energy",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_L.aac",
            ],
          },
          {
            name: "Magic FM",
            url: "https://bss1.neterra.tv/magicfm/magicfm.m3u8",
            fallbackUrls: ["https://bss.neterra.tv/rtplive/magicfmradio_live.stream/playlist.m3u8"],
          },
          {
            name: "Avto Radio",
            url: "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_H.aac",
            fallbackUrls: [
              "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_L.aac",
            ],
          },
          { name: "The Voice Radio", url: "https://bss.neterra.tv/rtplive/thevoiceradio_live.stream/playlist.m3u8" },
          { name: "bTV Radio", url: "https://cdn.bweb.bg/radio/btv-radio.mp3" },
        ],
      },
      "Serbia": {
        icon: "🇷🇸",
        stations: [
          { name: "Radio 021", url: "https://centova.dukahosting.com/proxy/021kafe/stream" },
        ],
      },
      "Russia": {
        icon: "🇷🇺",
        stations: [
          { name: "Radio Record", url: "https://radiorecord.hostingradio.ru/rr_main96.aacp" },
          { name: "Russian Gold", url: "https://radiorecord.hostingradio.ru/russiangold96.aacp" },
          { name: "Relax FM", url: "https://pub0201.101.ru/stream/trust/mp3/128/24" },
        ],
      },
      // Genre categories - non-commercial free streams (HTTPS only for mixed content safety)
      "Jazz": {
        icon: "🎷",
        stations: [
          { name: "KCSM Jazz", url: "https://ice7.securenetsystems.net/KCSM2" },
          { name: "Jazz24", url: "https://live.amperwave.net/direct/ppm-jazz24mp3-ibc1" },
          { name: "ABC Jazz", url: "https://live-radio01.mediahubaustralia.com/JAZW/mp3/" },
        ],
      },
      "Classical": {
        icon: "🎻",
        stations: [
          { name: "WQXR Classical", url: "https://stream.wqxr.org/wqxr" },
          { name: "ABC Classic", url: "https://live-radio01.mediahubaustralia.com/2FMW/mp3/" },
        ],
      },
      "Metal": {
        icon: "🤘",
        stations: [
          { name: "KNAC Pure Rock", url: "https://stream.knac.com/knac" },
        ],
      },
      "Ambient": {
        icon: "🌙",
        stations: [
          { name: "SomaFM Drone Zone", url: "https://ice1.somafm.com/dronezone-128-mp3" },
          { name: "SomaFM Space Station", url: "https://ice1.somafm.com/spacestation-128-mp3" },
          { name: "SomaFM Deep Space One", url: "https://ice1.somafm.com/deepspaceone-128-mp3" },
          { name: "SomaFM Groove Salad", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
        ],
      },
      "Electronic": {
        icon: "🎧",
        stations: [
          { name: "SomaFM Secret Agent", url: "https://ice1.somafm.com/secretagent-128-mp3" },
          { name: "SomaFM DEF CON", url: "https://ice1.somafm.com/defcon-128-mp3" },
          { name: "SomaFM Beat Blender", url: "https://ice1.somafm.com/beatblender-128-mp3" },
        ],
      },
    };

  const getRadioStations = memoTTL(async () => {
    // Helper to check if a URL is reachable
    async function checkUrl(url: string): Promise<boolean> {
      try {
        // Try HEAD first
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        if (response.status === 200 || response.status === 302 || response.status === 405) {
          return true;
        }
      } catch {
        // HEAD failed, continue to GET
      }

      // Try GET for streams that don't support HEAD
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        return response.status === 200 || response.status === 302;
      } catch {
        return false;
      }
    }

    // Check station and find best working URL (primary or fallback)
    async function checkStation(station: StationConfig): Promise<StationConfig | null> {
      // Try primary URL first
      if (await checkUrl(station.url)) {
        return station;
      }

      // Try fallback URLs
      if (station.fallbackUrls) {
        for (const fallbackUrl of station.fallbackUrls) {
          if (await checkUrl(fallbackUrl)) {
            // Return station with working fallback as primary
            return {
              ...station,
              url: fallbackUrl,
              fallbackUrls: [station.url, ...station.fallbackUrls.filter(u => u !== fallbackUrl)],
            };
          }
        }
      }

      // No working URLs found - still return station so user can try
      // (stream might work even if health check fails)
      return station;
    }

    // Response includes icon for each category
    interface CategoryResponse {
      icon: string;
      stations: StationConfig[];
    }

    // Test all stations in parallel, grouped by category
    const result: Record<string, CategoryResponse> = {};

    await Promise.all(
      Object.entries(stationsByCategory).map(async ([category, config]) => {
        const checkedStations = await Promise.all(
          config.stations.map(async (station) => checkStation(station))
        );
        result[category] = {
          icon: config.icon,
          stations: checkedStations.filter((s): s is StationConfig => s !== null),
        };
      })
    );

    return result;
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/radio/stations", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getRadioStations());
  }));

  // TV channels health check - tests which channels are accessible
  // Organized by region with Bulgaria first, then World News, then alphabetically by region
  const getTvChannels = memoTTL(async () => {
    const channelsByCountry: Record<string, Array<{ name: string; url: string; logo?: string; group?: string }>> = {
      // ============ BULGARIA (Primary) ============
      "🇧🇬 Bulgaria": [
        // Music Channels
        { name: "The Voice TV", url: "https://bss1.neterra.tv/thevoice/thevoice.m3u8", group: "Music", logo: "https://i.imgur.com/OoJSmoj.png" },
        { name: "Magic TV", url: "https://bss1.neterra.tv/magictv/magictv.m3u8", group: "Music", logo: "https://i.imgur.com/n7bcrrp.png" },
        { name: "Tiankov Folk", url: "https://streamer103.neterra.tv/tiankov-folk/live.m3u8", group: "Music", logo: "https://i.imgur.com/VKY4q64.png" },
        { name: "Tiankov Orient Folk", url: "https://streamer103.neterra.tv/tiankov-orient/live.m3u8", group: "Music", logo: "https://i.postimg.cc/KYNvL1ML/tiankovorientfolk.png" },
        { name: "City TV", url: "https://tv.city.bg/play/tshls/citytv/index.m3u8", group: "Music", logo: "https://i.imgur.com/qJvMbNH.png" },
        // Entertainment & Culture
        { name: "This is Bulgaria HD", url: "https://streamer103.neterra.tv/thisisbulgaria/live.m3u8", group: "Entertainment", logo: "https://i.imgur.com/062jkXw.png" },
        { name: "Travel TV", url: "https://streamer103.neterra.tv/travel/live.m3u8", group: "Travel", logo: "https://i.imgur.com/5xllfed.png" },
        { name: "TV1", url: "https://tv1.cloudcdn.bg/tv1/livestream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/LVHK1mW.png" },
        { name: "Evrokom", url: "https://live.ecomservice.bg/hls/stream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/8JvT9Yw.png" },
        // News & Information
        { name: "Bulgaria ON AIR", url: "https://edge1.cdn.bg:2006/fls/bonair.stream/playlist.m3u8", group: "News", logo: "https://i.imgur.com/YFZYJFN.png" },
        { name: "Kanal 0", url: "https://old.rn-tv.com/k0/stream.m3u8", group: "News", logo: "https://i.imgur.com/0kqJhHz.png" },
        // Regional
        { name: "TV Zagora", url: "http://zagoratv.ddns.net:8080/tvzagora.m3u8", group: "Regional", logo: "https://i.imgur.com/JxLHvfM.png" },
        { name: "DSTV", url: "http://46.249.95.140:8081/hls/data.m3u8", group: "Regional", logo: "https://i.imgur.com/bHWJZcY.png" },
        // Religious & Educational
        { name: "Hope Channel Bulgaria", url: "https://hc1.hopetv.bg/live/hopetv_all.smil/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/wvJ5PeX.png" },
        { name: "Plovdivska Pravoslavna TV", url: "http://78.130.149.196:1935/live/pptv.stream/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/TCqMqpM.png" },
        { name: "Light Channel", url: "https://streamer1.streamhost.org/salive/GMIlcbgM/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/pQlBXJc.png" },
        // International (Bulgarian)
        { name: "BNT 4 (World)", url: "https://viamotionhsi.netplus.ch/live/eds/bntworld/browser-HLS8/bntworld.m3u8", group: "International", logo: "https://i.imgur.com/LkXLDfm.png" },
        // Specialty
        { name: "Agro TV", url: "https://restr2.bgtv.bg/agro/hls/agro.m3u8", group: "Specialty", logo: "https://i.imgur.com/HVKjGjz.png" },
        { name: "100% Auto Moto TV", url: "http://100automoto.tv:1935/bgtv1/autotv/playlist.m3u8", group: "Specialty", logo: "https://i.imgur.com/GfDvKHv.png" },
        { name: "MM TV", url: "https://streamer103.neterra.tv/mmtv/mmtv.smil/playlist.m3u8", group: "Entertainment", logo: "https://i.imgur.com/QjYmVJf.png" },
        { name: "RMTV", url: "https://transcoder1.bitcare.eu/streaming/rimextv/rmtv.m3u8", group: "Entertainment", logo: "https://i.imgur.com/yqKKMnf.png" },
        { name: "Wness TV", url: "https://wness103.neterra.tv/wness/wness.smil/playlist.m3u8", group: "Lifestyle", logo: "https://i.imgur.com/kF5JNXN.png" },
      ],

      // ============ KIDS (Free Public Channels) ============
      "👶 Kids": [
        // USA
        { name: "PBS Kids", url: "https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8", group: "USA", logo: "https://i.imgur.com/mWLt6wY.png" },
        // Germany
        { name: "KiKA", url: "https://viamotionhsi.netplus.ch/live/eds/kikahd/browser-HLS8/kikahd.m3u8", group: "Germany", logo: "https://i.imgur.com/zVJQNfX.png" },
        { name: "Disney Channel DE", url: "https://viamotionhsi.netplus.ch/live/eds/disneychannelde/browser-HLS8/disneychannelde.m3u8", group: "Germany", logo: "https://i.imgur.com/tZLDXPq.png" },
        // Italy
        { name: "Rai Yoyo", url: "https://mediapolis.rai.it/relinker/relinkerServlet.htm?cont=746899", group: "Italy", logo: "https://i.imgur.com/NV8nqGU.png" },
        { name: "Rai Gulp", url: "https://viamotionhsi.netplus.ch/live/eds/raigulp/browser-HLS8/raigulp.m3u8", group: "Italy", logo: "https://i.imgur.com/TkKXzMa.png" },
        { name: "BeJoy Kids", url: "https://64b16f23efbee.streamlock.net/bejoy/bejoy/playlist.m3u8", group: "Italy", logo: "https://i.imgur.com/KQLnKcJ.png" },
        // Spain
        { name: "Clan TVE", url: "https://dum8zv1rbdjj2.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-x6uutpgph4tpt/ClanES.m3u8", group: "Spain", logo: "https://i.imgur.com/nBZrqvM.png" },
        // South Korea
        { name: "EBS Kids", url: "https://ebsonair.ebs.co.kr/ebs1familypc/familypc1m/playlist.m3u8", group: "Korea", logo: "https://i.imgur.com/5xGbMWt.png" },
      ],

      // ============ WORLD NEWS (International) ============
      "🌍 World News": [
        { name: "Al Jazeera English", url: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8", group: "News", logo: "https://i.imgur.com/GJmLFzF.png" },
        { name: "France 24 English", url: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8", group: "News", logo: "https://i.imgur.com/nTp4h4h.png" },
        { name: "France 24 French", url: "https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_5000.m3u8", group: "News", logo: "https://i.imgur.com/nTp4h4h.png" },
        { name: "DW English", url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8", group: "News", logo: "https://i.imgur.com/A1xzjOI.png" },
        { name: "DW Deutsch", url: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8", group: "News", logo: "https://i.imgur.com/A1xzjOI.png" },
        { name: "Euronews English", url: "https://viamotionhsi.netplus.ch/live/eds/euronews/browser-HLS8/euronews.m3u8", group: "News", logo: "https://i.imgur.com/7MBmUgR.png" },
        { name: "RT News", url: "https://rt-glb.rttv.com/live/rtnews/playlist.m3u8", group: "News", logo: "https://i.imgur.com/8gWDnIw.png" },
        { name: "NHK World Japan", url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8", group: "News", logo: "https://i.imgur.com/z0TbRUV.png" },
        { name: "Arirang TV Korea", url: "http://amdlive-ch01.ctnd.com.edgesuite.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8", group: "News", logo: "https://i.imgur.com/fLvHpCL.png" },
        { name: "CGTN", url: "https://news.cgtn.com/resource/live/english/cgtn-news.m3u8", group: "News", logo: "https://i.imgur.com/T5xds9w.png" },
      ],

      // ============ EUROPE ============
      "🇩🇪 Germany": [
        { name: "Das Erste", url: "https://daserste-live.ard-mcdn.de/daserste/live/hls/int/master.m3u8", group: "Public", logo: "https://i.imgur.com/rJgRxnA.png" },
        { name: "ZDF", url: "https://viamotionhsi.netplus.ch/live/eds/zdfhd/browser-HLS8/zdfhd.m3u8", group: "Public", logo: "https://i.imgur.com/9sVBnvH.png" },
        { name: "Tagesschau 24", url: "https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8", group: "News", logo: "https://i.imgur.com/5CMVoTy.png" },
        { name: "Phoenix", url: "https://viamotionhsi.netplus.ch/live/eds/phoenixhd/browser-HLS8/phoenixhd.m3u8", group: "News", logo: "https://i.imgur.com/xYyNDQT.png" },
        { name: "ARD-alpha", url: "https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8", group: "Education", logo: "https://i.imgur.com/WprNwGJ.png" },
        { name: "hr-fernsehen", url: "https://hrhls.akamaized.net/hls/live/2024525/hrhls/index.m3u8", group: "Regional", logo: "https://i.imgur.com/6vYkRqY.png" },
        { name: "WDR", url: "https://wdr-live.ard-mcdn.de/wdr/live/hls/de/master.m3u8", group: "Regional", logo: "https://i.imgur.com/KqPLUeX.png" },
        { name: "NDR Hamburg", url: "https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_hh/master.m3u8", group: "Regional", logo: "https://i.imgur.com/xdYNzKX.png" },
      ],
      "🇫🇷 France": [
        { name: "France 2", url: "https://viamotionhsi.netplus.ch/live/eds/france2hd/browser-HLS8/france2hd.m3u8", group: "Public", logo: "https://i.imgur.com/pbmqYmV.png" },
        { name: "France 3", url: "https://viamotionhsi.netplus.ch/live/eds/france3hd/browser-HLS8/france3hd.m3u8", group: "Public", logo: "https://i.imgur.com/XWNcqMP.png" },
        { name: "France 5", url: "https://viamotionhsi.netplus.ch/live/eds/france5hd/browser-HLS8/france5hd.m3u8", group: "Public", logo: "https://i.imgur.com/wBnXOUn.png" },
        { name: "Arte", url: "https://viamotionhsi.netplus.ch/live/eds/artehd/browser-HLS8/artehd.m3u8", group: "Culture", logo: "https://i.imgur.com/9KI9VvS.png" },
        { name: "TF1", url: "https://viamotionhsi.netplus.ch/live/eds/tf1hd/browser-HLS8/tf1hd.m3u8", group: "Entertainment", logo: "https://i.imgur.com/Gm4XYmT.png" },
        { name: "Franceinfo", url: "https://viamotionhsi.netplus.ch/live/eds/franceinfo/browser-HLS8/franceinfo.m3u8", group: "News", logo: "https://i.imgur.com/cC5IK6q.png" },
        { name: "BFM TV", url: "https://viamotionhsi.netplus.ch/live/eds/bfmtv/browser-HLS8/bfmtv.m3u8", group: "News", logo: "https://i.imgur.com/fZ8OhBr.png" },
        { name: "TV5Monde", url: "https://viamotionhsi.netplus.ch/live/eds/tv5mondefbs/browser-HLS8/tv5mondefbs.m3u8", group: "International", logo: "https://i.imgur.com/6j1Bsxu.png" },
      ],
      "🇮🇹 Italy": [
        { name: "Rai 1", url: "https://viamotionhsi.netplus.ch/live/eds/rai1/browser-HLS8/rai1.m3u8", group: "Public", logo: "https://i.imgur.com/GnVGqxP.png" },
        { name: "Rai 2", url: "https://viamotionhsi.netplus.ch/live/eds/rai2/browser-HLS8/rai2.m3u8", group: "Public", logo: "https://i.imgur.com/nzP6Qe1.png" },
        { name: "Rai 3", url: "https://viamotionhsi.netplus.ch/live/eds/rai3/browser-HLS8/rai3.m3u8", group: "Public", logo: "https://i.imgur.com/6rRFwQE.png" },
        { name: "Rai News 24", url: "https://viamotionhsi.netplus.ch/live/eds/rainews/browser-HLS8/rainews.m3u8", group: "News", logo: "https://i.imgur.com/NQZBcvJ.png" },
        { name: "La7", url: "https://viamotionhsi.netplus.ch/live/eds/la7/browser-HLS8/la7.m3u8", group: "Entertainment", logo: "https://i.imgur.com/Gj8mHVu.png" },
        { name: "Canale 5", url: "https://viamotionhsi.netplus.ch/live/eds/canale5/browser-HLS8/canale5.m3u8", group: "Entertainment", logo: "https://i.imgur.com/qxlZXpT.png" },
        { name: "Rai Gulp", url: "https://viamotionhsi.netplus.ch/live/eds/raigulp/browser-HLS8/raigulp.m3u8", group: "Kids", logo: "https://i.imgur.com/TkKXzMa.png" },
        { name: "Rai Scuola", url: "https://viamotionhsi.netplus.ch/live/eds/raiscuola/browser-HLS8/raiscuola.m3u8", group: "Education", logo: "https://i.imgur.com/JqLPnEj.png" },
      ],
      "🇪🇸 Spain": [
        { name: "La 1 (TVE)", url: "https://ztnr.rtve.es/ztnr/1688877.m3u8", group: "Public", logo: "https://i.imgur.com/QJvbpnL.png" },
        { name: "La 2 (TVE)", url: "https://ztnr.rtve.es/ztnr/1688885.m3u8", group: "Public", logo: "https://i.imgur.com/z0BQxWH.png" },
        { name: "Canal 24 Horas", url: "https://ztnr.rtve.es/ztnr/1694255.m3u8", group: "News", logo: "https://i.imgur.com/Zcy2kM3.png" },
        { name: "Telemadrid", url: "https://telemadrid-23-secure2.akamaized.net/master.m3u8", group: "Regional", logo: "https://i.imgur.com/xVZ6iYL.png" },
      ],
      "🇬🇷 Greece": [
        { name: "ERT 1", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert1/ert1.m3u8", group: "Public", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT 2", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert2/ert2.m3u8", group: "Public", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT 3", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert3/ert3.m3u8", group: "Regional", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT Sports", url: "https://ert-live-bcbs15228.siliconweb.com/media/ertsports/ertsports.m3u8", group: "Sports", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT World", url: "https://ert-live-bcbs15228.siliconweb.com/media/ertworld/ertworld.m3u8", group: "International", logo: "https://i.imgur.com/Z8rZZVn.png" },
      ],
      "🇷🇸 Serbia": [
        { name: "RTS 1", url: "https://rts1.streaming.rs/rts1/rts1.m3u8", group: "Public", logo: "https://i.imgur.com/4K1rQXZ.png" },
        { name: "RTS 2", url: "https://rts2.streaming.rs/rts2/rts2.m3u8", group: "Public", logo: "https://i.imgur.com/4K1rQXZ.png" },
        { name: "Pink TV", url: "http://pink.streaming.rs/pink/pink.m3u8", group: "Entertainment", logo: "https://i.imgur.com/aDNqJ1Y.png" },
        { name: "B92", url: "http://b92.streaming.rs/b92/b92.m3u8", group: "Entertainment", logo: "https://i.imgur.com/4rPQCMF.png" },
        { name: "Happy TV", url: "http://happy.streaming.rs/happy/happy.m3u8", group: "Entertainment", logo: "https://i.imgur.com/5jKQ5pM.png" },
      ],
      "🇵🇱 Poland": [
        { name: "TVP World", url: "https://dash2.antik.sk/live/test_tvp_world/playlist.m3u8", group: "International", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TVP Polonia", url: "https://viamotionhsi.netplus.ch/live/eds/tvpolonia/browser-HLS8/tvpolonia.m3u8", group: "International", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TVP Info", url: "https://dash4.antik.sk/live/test_tvp_info/playlist.m3u8", group: "News", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TV Biznesowa", url: "https://s-pl-01.mediatool.tv/playout/tbpl-abr/index.m3u8", group: "Business", logo: "https://i.imgur.com/JBKiMVx.png" },
      ],
      "🇹🇷 Turkey": [
        { name: "TRT 1", url: "https://trt.daioncdn.net/trt-1/master.m3u8?app=web", group: "Public", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "TRT 2", url: "https://tv-trt2.medya.trt.com.tr/master.m3u8", group: "Culture", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "TRT Haber", url: "https://tv-trthaber.medya.trt.com.tr/master.m3u8", group: "News", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "Habertürk", url: "https://ciner-live.daioncdn.net/haberturktv/haberturktv.m3u8", group: "News", logo: "https://i.imgur.com/vYKlJmS.png" },
        { name: "NTV Turkey", url: "https://dogus-live.daioncdn.net/ntv/ntv.m3u8", group: "News", logo: "https://i.imgur.com/dSLQCLJ.png" },
        { name: "Kanal D", url: "https://demiroren.daioncdn.net/kanald/kanald.m3u8?app=kanald_web&ce=3", group: "Entertainment", logo: "https://i.imgur.com/yVJXpcZ.png" },
        { name: "Halk TV", url: "https://halktv-live.daioncdn.net/halktv/halktv.m3u8", group: "News", logo: "https://i.imgur.com/xN4P4VJ.png" },
        { name: "Tele 1", url: "https://tele1-live.ercdn.net/tele1/tele1.m3u8", group: "News", logo: "https://i.imgur.com/TxVSJDG.png" },
      ],
      "🇷🇺 Russia": [
        { name: "Channel One", url: "https://edge1.1internet.tv/live-cdn/pervyi/tracks-v1a1/mono.m3u8", group: "Public", logo: "https://i.imgur.com/cZUxvlM.png" },
        { name: "Russia 1", url: "https://edge1.1internet.tv/live-cdn/russia1/tracks-v1a1/mono.m3u8", group: "Public", logo: "https://i.imgur.com/2P7xvYb.png" },
        { name: "NTV Russia", url: "https://edge1.1internet.tv/live-cdn/ntv/tracks-v1a1/mono.m3u8", group: "Entertainment", logo: "https://i.imgur.com/dYk8WCx.png" },
        { name: "Zvezda", url: "https://live-cdn.zvezda.ru/live/zvezda/tracks-v1a1/mono.m3u8", group: "News", logo: "https://i.imgur.com/6qLLc8H.png" },
      ],

      // ============ AMERICAS ============
      "🇺🇸 USA": [
        { name: "ABC News", url: "https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8", group: "News", logo: "https://i.imgur.com/5kLLe2G.png" },
        { name: "NBC News NOW", url: "https://d1bl6tskrpq9ze.cloudfront.net/hls/master.m3u8", group: "News", logo: "https://i.imgur.com/m8G7RBj.png" },
        { name: "Newsmax", url: "https://nmx1ota.akamaized.net/hls/live/2107010/Live_1/index.m3u8", group: "News", logo: "https://i.imgur.com/bBMVw6r.png" },
        { name: "Bloomberg US", url: "https://bloomberg.com/media-manifest/streams/us.m3u8", group: "Business", logo: "https://i.imgur.com/DqKlQPr.png" },
        { name: "Cheddar News", url: "https://cheddar-us.samsung.wurl.tv/playlist.m3u8", group: "Business", logo: "https://i.imgur.com/x9QFVMX.png" },
        { name: "Fox Weather", url: "https://247wlive.foxweather.com/stream/index.m3u8", group: "Weather", logo: "https://i.imgur.com/HvpLYEv.png" },
        { name: "Court TV", url: "https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01438-ewscrippscompan-courttv-tablo/playlist.m3u8", group: "Legal", logo: "https://i.imgur.com/YIIlnVY.png" },
        { name: "Scripps News", url: "https://content.uplynk.com/channel/4bb4901b934c4e029fd4c1abfc766c37.m3u8", group: "News", logo: "https://i.imgur.com/7xKL9vF.png" },
      ],
      "🇧🇷 Brazil": [
        { name: "TV Brasil", url: "https://tvbrasil-stream.ebc.com.br/index.m3u8", group: "Public", logo: "https://i.imgur.com/KG6CQZl.png" },
        { name: "Record News", url: "https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8", group: "News", logo: "https://i.imgur.com/1vXbsMM.png" },
        { name: "TV Cultura", url: "https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8", group: "Culture", logo: "https://i.imgur.com/y6LHQl8.png" },
        { name: "TV Câmara", url: "https://stream3.camara.gov.br/tv1/manifest.m3u8", group: "Government", logo: "https://i.imgur.com/6TfL5Ua.png" },
        { name: "Canal Educação", url: "https://canaleducacao-stream.ebc.com.br/index.m3u8", group: "Education", logo: "https://i.imgur.com/cR7PJGQ.png" },
        { name: "Jovem Pan News", url: "https://d6yfbj4xxtrod.cloudfront.net/out/v1/7836eb391ec24452b149f3dc6df15bbd/index.m3u8", group: "News", logo: "https://i.imgur.com/6pXMnqs.png" },
      ],
      "🇦🇷 Argentina": [
        { name: "El Trece", url: "https://live-01-02-eltrece.vodgc.net/eltrecetv/index.m3u8", group: "Entertainment", logo: "https://i.imgur.com/dVaU6LQ.png" },
        { name: "Canal 26", url: "https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8", group: "News", logo: "https://i.imgur.com/xF9hLgN.png" },
        { name: "America TV", url: "https://prepublish.f.qaotic.net/a07/americahls-100056/playlist_720p.m3u8", group: "Entertainment", logo: "https://i.imgur.com/xfN4p9F.png" },
        { name: "Canal E", url: "https://unlimited1-us.dps.live/perfiltv/perfiltv.smil/playlist.m3u8", group: "Business", logo: "https://i.imgur.com/7wD2vhT.png" },
      ],

      // ============ ASIA ============
      "🇯🇵 Japan": [
        { name: "NHK World", url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8", group: "Public", logo: "https://i.imgur.com/z0TbRUV.png" },
        { name: "Weathernews", url: "https://weather-live-hls01e.akamaized.net/ade36978-4ad3-48de-91ab-7d6edd0b6388/11ed8ed8ca.ism/manifest(format=m3u8-aapl-v3,audio-only=false).m3u8", group: "Weather", logo: "https://i.imgur.com/8NWYKQx.png" },
        { name: "QVC Japan", url: "https://cdn-live1.qvc.jp/iPhone/1501/1501.m3u8", group: "Shopping", logo: "https://i.imgur.com/nnc4Kgh.png" },
      ],
      "🇰🇷 South Korea": [
        { name: "KTV Korea", url: "https://hlive.ktv.go.kr/live/klive_h.stream/playlist.m3u8", group: "Government", logo: "https://i.imgur.com/cPqfGKz.png" },
        { name: "Arirang TV", url: "http://amdlive-ch01.ctnd.com.edgesuite.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8", group: "International", logo: "https://i.imgur.com/fLvHpCL.png" },
        { name: "TBS Seoul", url: "https://cdntv.tbs.seoul.kr/tbs/tbs_tv_web.smil/playlist.m3u8", group: "Regional", logo: "https://i.imgur.com/VxQMk5x.png" },
        { name: "EBS 1", url: "https://ebsonair.ebs.co.kr/ebs1familypc/familypc1m/playlist.m3u8", group: "Education", logo: "https://i.imgur.com/5xGbMWt.png" },
      ],
      "🇮🇳 India": [
        { name: "NDTV 24x7", url: "https://ndtv24x7elemarchana.akamaized.net/hls/live/2003678/ndtv24x7/master.m3u8", group: "News", logo: "https://i.imgur.com/QQBbZxO.png" },
        { name: "India TV", url: "https://pl-indiatvnews.akamaized.net/out/v1/db79179b608641ceaa5a4d0dd0dca8da/index.m3u8", group: "News", logo: "https://i.imgur.com/F9Y5Txy.png" },
        { name: "ABP News", url: "https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/abpnews-livetv/master.m3u8", group: "News", logo: "https://i.imgur.com/2XbCzxF.png" },
        { name: "CNBC TV18", url: "https://n18syndication.akamaized.net/bpk-tv/CNBC_TV18_NW18_MOB/output01/index.m3u8", group: "Business", logo: "https://i.imgur.com/dKNwSxq.png" },
        { name: "Sansad TV", url: "https://playhls.media.nic.in/hls/live/lstv/lstv.m3u8", group: "Government", logo: "https://i.imgur.com/xm7WYoV.png" },
      ],
    };

    // Helper to check if a channel is healthy
    async function checkChannel(channel: { name: string; url: string; logo?: string }) {
      try {
        const response = await fetch(channel.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        return response.status === 200 || response.status === 302 || response.status === 405;
      } catch {
        // Try GET for streams that don't support HEAD
        try {
          const response = await fetch(channel.url, {
            method: "GET",
            signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
            redirect: "follow",
          });
          await discardBody(response);

          return response.status === 200 || response.status === 302;
        } catch {
          return false;
        }
      }
    }

    // Test all channels in parallel and group by country
    const result: Record<string, Array<{ name: string; url: string; logo?: string }>> = {};
    
    await Promise.all(
      Object.entries(channelsByCountry).map(async ([country, channels]) => {
        const healthyChannels = await Promise.all(
          channels.map(async (channel) => {
            const isHealthy = await checkChannel(channel);
            return isHealthy ? channel : null;
          })
        );
        result[country] = healthyChannels.filter((c): c is typeof channels[0] => c !== null);
      })
    );

    return result;
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/tv/channels", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getTvChannels());
  }));

  // Legacy radio stream proxy (kept for backward compatibility)
  app.get("/api/radio/stream", async (req: Request, res: Response) => {
    // Redirect to the new media proxy
    const streamUrl = req.query.url as string;
    if (streamUrl) {
      res.redirect(`/api/media/proxy?url=${encodeURIComponent(streamUrl)}`);
    } else {
      res.status(400).json({ error: "Missing stream URL" });
    }
  });

  // Radio stream validation endpoint - deep health check for all stations
  const getRadioValidation = memoTTL(async () => {
    interface ValidationResult {
      name: string;
      url: string;
      status: "ok" | "degraded" | "error";
      responseTimeMs: number;
      contentType: string | null;
      httpStatus: number | null;
      bytesReceived: number;
      error: string | null;
      checkedAt: string;
    }

    // All stations to validate (same source as /api/radio/stations Bulgaria category)
    const stationsToValidate = [
      { name: "BG Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_H.aac" },
      { name: "BG Radio (Low)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/BG_RADIOAAC_L.aac" },
      { name: "Radio Energy", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_H.aac" },
      { name: "Radio Energy (Low)", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ENERGYAAC_L.aac" },
      { name: "Magic FM", url: "https://bss1.neterra.tv/magicfm/magicfm.m3u8" },
      { name: "Avto Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/AVTORADIOAAC_H.aac" },
      { name: "The Voice Radio", url: "https://bss.neterra.tv/rtplive/thevoiceradio_live.stream/playlist.m3u8" },
      { name: "bTV Radio", url: "https://cdn.bweb.bg/radio/btv-radio.mp3" },
    ];

    async function validateStation(station: { name: string; url: string }): Promise<ValidationResult> {
      const startTime = Date.now();
      const result: ValidationResult = {
        name: station.name,
        url: station.url,
        status: "error",
        responseTimeMs: 0,
        contentType: null,
        httpStatus: null,
        bytesReceived: 0,
        error: null,
        checkedAt: new Date().toISOString(),
      };

      try {
        const response = await fetch(station.url, {
          method: "GET",
          headers: {
            "User-Agent": "FamilyFrame/1.0",
            "Icy-MetaData": "1",
          },
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });

        result.httpStatus = response.status;
        result.contentType = response.headers.get("content-type");
        result.responseTimeMs = Date.now() - startTime;

        if (response.status !== 200) {
          result.error = `HTTP ${response.status}`;
          await discardBody(response);
          return result;
        }

        // Try to read some bytes to verify the stream is actually delivering data
        const reader = response.body?.getReader();
        if (reader) {
          try {
            const { done, value } = await reader.read();
            if (!done && value) {
              result.bytesReceived = value.length;
            }
          } catch {
            // Stream read failed but connection was ok
          } finally {
            await reader.cancel().catch(() => {});
          }
        }

        // Determine status based on results
        const isAudioContent = result.contentType?.includes("audio") ||
          result.contentType?.includes("mpeg") ||
          result.contentType?.includes("aac") ||
          result.contentType?.includes("ogg") ||
          result.contentType?.includes("mpegurl") ||
          result.contentType?.includes("x-mpegurl") ||
          result.contentType?.includes("octet-stream") ||
          result.contentType?.includes("application/vnd.apple");

        if (result.bytesReceived > 0 && isAudioContent) {
          result.status = result.responseTimeMs > 3000 ? "degraded" : "ok";
        } else if (result.bytesReceived > 0) {
          // Got data but content type is unexpected (might still work for HLS playlists)
          result.status = "degraded";
          result.error = `Unexpected content-type: ${result.contentType}`;
        } else {
          result.status = "error";
          result.error = "No audio data received";
        }
      } catch (err: any) {
        result.responseTimeMs = Date.now() - startTime;
        if (err.name === "AbortError" || err.name === "TimeoutError") {
          result.error = "Timeout (>5s)";
        } else {
          result.error = err.message || "Connection failed";
        }
      }

      return result;
    }

    // Run all validations in parallel
    const results = await Promise.all(
      stationsToValidate.map(station => validateStation(station))
    );

    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === "ok").length,
      degraded: results.filter(r => r.status === "degraded").length,
      error: results.filter(r => r.status === "error").length,
    };

    return { summary, stations: results };
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/radio/validate", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getRadioValidation());
  }));

  // Radio metadata endpoint - fetches ICY stream metadata (now playing info)
  app.get("/api/radio/metadata", async (req: Request, res: Response) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).json({ error: "Missing stream URL" });
    }

    const radioHosts = [
      ...ALLOWED_STREAM_DOMAINS,
      ...Object.values(stationsByCategory).flatMap((c) =>
        c.stations.flatMap((st) =>
          [st.url, ...(st.fallbackUrls ?? [])].map((u) => new URL(u).hostname),
        ),
      ),
    ];
    if (typeof streamUrl !== "string" || !isAllowedStreamUrl(streamUrl, radioHosts)) {
      return res.status(400).json({ error: "Stream URL not allowed" });
    }

    try {
      // One 5s deadline covers connect, headers and the body read loop
      const signal = AbortSignal.timeout(5000);

      // Request stream with ICY metadata header
      const response = await fetchFollowingAllowed(streamUrl, radioHosts, {
        method: "GET",
        headers: {
          "Icy-MetaData": "1",
          "User-Agent": "FamilyFrame/1.0",
        },
        signal,
      });

      // Extract ICY headers
      const icyName = response.headers.get("icy-name") || null;
      const icyDescription = response.headers.get("icy-description") || null;
      const icyGenre = response.headers.get("icy-genre") || null;
      const icyBitrate = response.headers.get("icy-br") || null;
      const icyUrl = response.headers.get("icy-url") || null;
      const contentType = response.headers.get("content-type") || null;
      const icyMetaInt = response.headers.get("icy-metaint");

      let nowPlaying: string | null = null;
      let artist: string | null = null;
      let title: string | null = null;

      // If stream provides metadata interval, read first chunk to extract now playing
      if (icyMetaInt) {
        const metaInterval = parseInt(icyMetaInt, 10);
        if (metaInterval > 0 && metaInterval < 65536) {
          try {
            const reader = response.body?.getReader();
            if (reader) {
              let bytesRead = 0;
              const maxBytes = Math.min(metaInterval + 4096, 65536); // capped at 64 KB

              while (bytesRead < maxBytes) {
                const { done, value } = await reader.read();
                if (done) break;
                
                bytesRead += value.length;

                // Check if we've passed the metadata interval
                if (bytesRead > metaInterval) {
                  // The metadata is after metaInterval bytes
                  // First byte after interval is length (length * 16 = metadata size)
                  const metaStart = metaInterval - (bytesRead - value.length);
                  if (metaStart >= 0 && metaStart < value.length) {
                    const metaLength = value[metaStart] * 16;
                    if (metaLength > 0 && metaStart + 1 + metaLength <= value.length) {
                      const metaData = new TextDecoder().decode(
                        value.slice(metaStart + 1, metaStart + 1 + metaLength)
                      );
                      // Parse StreamTitle='Artist - Title';
                      const titleMatch = metaData.match(/StreamTitle='([^']*)'/);
                      if (titleMatch && titleMatch[1]) {
                        nowPlaying = titleMatch[1].trim();
                        // Try to split into artist and title
                        const parts = nowPlaying.split(" - ");
                        if (parts.length >= 2) {
                          artist = parts[0].trim();
                          title = parts.slice(1).join(" - ").trim();
                        } else {
                          title = nowPlaying;
                        }
                      }
                    }
                  }
                  break;
                }
              }
              await reader.cancel().catch(() => {});
            }
          } catch {
            // Ignore metadata parsing errors
          }
        }
      }

      // Close the stream (no-op if the reader above already cancelled it)
      if (response.body && !response.body.locked) {
        await response.body.cancel().catch(() => {});
      }

      res.json({
        stationName: icyName,
        description: icyDescription,
        genre: icyGenre,
        bitrate: icyBitrate ? parseInt(icyBitrate, 10) : null,
        stationUrl: icyUrl,
        contentType,
        nowPlaying,
        artist,
        title,
      });
    } catch (error: any) {
      if (error instanceof DisallowedRedirectError) {
        return res.status(502).json({ error: "Stream redirect not allowed" });
      }
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return res.status(504).json({ error: "Timeout fetching stream metadata" });
      }
      console.error("[Radio Metadata] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch stream metadata" });
    }
  });

  // Market data endpoint - fetches all requested stocks with historical performance
  app.get("/api/market", async (req: Request, res: Response) => {
    try {
      const symbolsParam = req.query.symbols as string || "DJI,SPX,VNQ,BTC,GOLD";
      const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

      const stockConfig: Record<string, { yahooSymbol?: string; isCrypto?: boolean; name: string }> = {
        "DJI": { yahooSymbol: "^DJI", name: "Dow Jones" },
        "SPX": { yahooSymbol: "^GSPC", name: "S&P 500" },
        "VNQ": { yahooSymbol: "VNQ", name: "Real Estate" },
        "BTC": { isCrypto: true, name: "Bitcoin" },
        "GOLD": { yahooSymbol: "GC=F", name: "Gold" },
        "MSFT": { yahooSymbol: "MSFT", name: "Microsoft" },
        "CRM": { yahooSymbol: "CRM", name: "Salesforce" },
        "ISRG": { yahooSymbol: "ISRG", name: "Intuitive Surgical" },
      };

      interface MarketResult {
        symbol: string;
        name: string;
        price: number;
        change: number;
        changePercent: number;
        changeLabel: string; // "1D", "1M" etc. to indicate what period the change covers
        change1Y?: number;
        change3Y?: number;
        change5Y?: number;
        change10Y?: number;
        historicalPrices?: Array<{ t: number; p: number }>; // ms timestamp + price for chart
      }

      const results: Record<string, MarketResult | null> = {};

      // Build fetch requests - now fetching 5 year data for historical analysis
      const fetchPromises: Promise<{ symbol: string; data: any; historical?: any }>[] = [];

      for (const symbol of symbols) {
        const config = stockConfig[symbol];
        if (!config) continue;

        if (config.isCrypto) {
          // Fetch current price and historical data for Bitcoin (max range for 10Y)
          fetchPromises.push(
            Promise.all([
              fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
              fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=3650", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            ]).then(([data, historical]) => ({ symbol, data, historical }))
          );
        } else if (config.yahooSymbol) {
          // Fetch 10 year data for historical analysis
          fetchPromises.push(
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahooSymbol)}?interval=1mo&range=10y`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
              .then(r => r.ok ? r.json() : null)
              .then(data => ({ symbol, data }))
              .catch(() => ({ symbol, data: null }))
          );
        }
      }

      const responses = await Promise.all(fetchPromises);

      for (const { symbol, data, historical } of responses) {
        const config = stockConfig[symbol];
        if (!config || !data) {
          results[symbol.toLowerCase()] = null;
          continue;
        }

        if (config.isCrypto && data.bitcoin) {
          const currentPrice = data.bitcoin.usd;
          const dailyChange = data.bitcoin.usd_24h_change || 0;
          const result: MarketResult = {
            symbol,
            name: config.name,
            price: currentPrice,
            change: dailyChange,
            changePercent: dailyChange,
            changeLabel: "1D"
          };

          // Calculate historical changes from CoinGecko market_chart data
          if (historical?.prices && historical.prices.length > 0) {
            const prices = historical.prices as Array<[number, number]>;
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
            const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60 * 1000;
            const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
            const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60 * 1000;

            // Find prices closest to 1Y, 3Y, 5Y, 10Y ago
            const findPriceAtTime = (targetTime: number) => {
              let closest = prices[0];
              for (const p of prices) {
                if (Math.abs(p[0] - targetTime) < Math.abs(closest[0] - targetTime)) {
                  closest = p;
                }
              }
              // Only return if the closest data point is within 60 days of the target
              if (Math.abs(closest[0] - targetTime) > 60 * 24 * 60 * 60 * 1000) return null;
              return closest[1];
            };

            const price1YAgo = findPriceAtTime(oneYearAgo);
            const price3YAgo = findPriceAtTime(threeYearsAgo);
            const price5YAgo = findPriceAtTime(fiveYearsAgo);
            const price10YAgo = findPriceAtTime(tenYearsAgo);

            if (price1YAgo) result.change1Y = ((currentPrice - price1YAgo) / price1YAgo) * 100;
            if (price3YAgo) result.change3Y = ((currentPrice - price3YAgo) / price3YAgo) * 100;
            if (price5YAgo) result.change5Y = ((currentPrice - price5YAgo) / price5YAgo) * 100;
            if (price10YAgo) result.change10Y = ((currentPrice - price10YAgo) / price10YAgo) * 100;

            // If daily change is 0, fall back to comparing last two data points
            if (result.changePercent === 0 && prices.length >= 2) {
              const lastPrice = prices[prices.length - 1][1];
              const prevPrice = prices[prices.length - 2][1];
              if (prevPrice !== 0) {
                result.change = lastPrice - prevPrice;
                result.changePercent = ((lastPrice - prevPrice) / prevPrice) * 100;
                result.changeLabel = "prev";
              }
            }

            // Downsample historical prices for chart (keep ~120 points max)
            const step = Math.max(1, Math.floor(prices.length / 120));
            result.historicalPrices = prices
              .filter((_: [number, number], i: number) => i % step === 0 || i === prices.length - 1)
              .map((p: [number, number]) => ({ t: p[0], p: p[1] }));
          }

          results[symbol.toLowerCase()] = result;
        } else if (data.chart?.result?.[0]) {
          const chart = data.chart.result[0];
          const price = chart.meta?.regularMarketPrice;
          const prevClose = chart.meta?.previousClose;

          if (price) {
            const change = prevClose ? price - prevClose : 0;
            const changePercent = prevClose ? (change / prevClose) * 100 : 0;
            const result: MarketResult = {
              symbol,
              name: config.name,
              price,
              change,
              changePercent,
              changeLabel: "1D"
            };

            // Calculate historical changes from Yahoo Finance monthly data
            const timestamps = chart.timestamp || [];
            const closes = chart.indicators?.quote?.[0]?.close || [];

            if (timestamps.length > 0 && closes.length > 0) {
              const now = Math.floor(Date.now() / 1000);
              const oneYearAgo = now - 365 * 24 * 60 * 60;
              const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60;
              const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60;
              const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60;

              // Find prices closest to 1Y, 3Y, 5Y, 10Y ago (within 60 days tolerance)
              const findPriceAtTime = (targetTime: number) => {
                let closestIdx = 0;
                let closestDiff = Math.abs(timestamps[0] - targetTime);
                for (let i = 1; i < timestamps.length; i++) {
                  const diff = Math.abs(timestamps[i] - targetTime);
                  if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = i;
                  }
                }
                // Only return if within 60 days of target
                if (closestDiff > 60 * 24 * 60 * 60) return null;
                return closes[closestIdx];
              };

              const price1YAgo = findPriceAtTime(oneYearAgo);
              const price3YAgo = findPriceAtTime(threeYearsAgo);
              const price5YAgo = findPriceAtTime(fiveYearsAgo);
              const price10YAgo = findPriceAtTime(tenYearsAgo);

              if (price1YAgo) result.change1Y = ((price - price1YAgo) / price1YAgo) * 100;
              if (price3YAgo) result.change3Y = ((price - price3YAgo) / price3YAgo) * 100;
              if (price5YAgo) result.change5Y = ((price - price5YAgo) / price5YAgo) * 100;
              if (price10YAgo) result.change10Y = ((price - price10YAgo) / price10YAgo) * 100;

              // If daily change is 0, fall back to last two monthly close prices
              if (result.changePercent === 0) {
                // Find last two valid (non-null) closes
                let lastValid = -1;
                let prevValid = -1;
                for (let i = closes.length - 1; i >= 0; i--) {
                  if (closes[i] != null) {
                    if (lastValid === -1) lastValid = i;
                    else if (prevValid === -1) { prevValid = i; break; }
                  }
                }
                if (lastValid >= 0 && prevValid >= 0 && closes[prevValid] !== 0) {
                  result.change = closes[lastValid] - closes[prevValid];
                  result.changePercent = ((closes[lastValid] - closes[prevValid]) / closes[prevValid]) * 100;
                  result.changeLabel = "1M";
                }
              }

              // Build historical prices for chart
              result.historicalPrices = timestamps
                .map((ts: number, i: number) => closes[i] != null ? { t: ts * 1000, p: closes[i] } : null)
                .filter((d: { t: number; p: number } | null): d is { t: number; p: number } => d !== null);
            }

            results[symbol.toLowerCase()] = result;
          } else {
            results[symbol.toLowerCase()] = null;
          }
        } else {
          results[symbol.toLowerCase()] = null;
        }
      }

      // Legacy support: also return dow and bitcoin at top level
      res.json({
        ...results,
        dow: results.dji || null,
        bitcoin: results.btc || null
      });
    } catch (error) {
      console.error("Market data error:", error);
      res.json({ dow: null, bitcoin: null });
    }
  });

  app.get("/api/google/auth-url", async (req: Request, res: Response) => {
    try {
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        res.status(503).json(OAUTH_NOT_CONFIGURED);
        return;
      }

      const userId = req.headers["x-clerk-user-id"] as string;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized - please sign in" });
        return;
      }

      // Always use production URL for Google OAuth to avoid redirect_uri_mismatch errors
      // This ensures the callback URL matches what's registered in Google Cloud Console
      const redirectUri = `${getAppBaseUrl()}/api/google/callback`;

      // Signed state carries the user ID through the cross-site redirect and is
      // bound to this browser via a single-use nonce cookie
      const { state: signedState, nonce } = createOAuthState(userId, secret);
      res.cookie(OAUTH_NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: OAUTH_NONCE_MAX_AGE_MS,
      });

      const authUrl = getGoogleAuthUrl(redirectUri, signedState);
      res.json({ url: authUrl });
    } catch (error) {
      console.error("Google auth URL error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const secret = process.env.SESSION_SECRET;
      if (!secret) {
        res.status(503).json(OAUTH_NOT_CONFIGURED);
        return;
      }

      const code = req.query.code as string;
      const stateParam = req.query.state as string;
      const nonceCookie = req.cookies?.[OAUTH_NONCE_COOKIE] as string | undefined;
      // Single use: clear regardless of outcome so a replayed state fails
      res.clearCookie(OAUTH_NONCE_COOKIE, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });

      if (!code) {
        res.redirect("/settings?error=no_code");
        return;
      }

      const verified = stateParam ? verifyOAuthState(stateParam, nonceCookie, secret) : null;
      if (stateParam && !verified) {
        res.redirect("/settings?error=invalid_state");
        return;
      }
      const userId = verified?.userId;
      const username = "user";

      if (!userId) {
        res.redirect("/settings?error=auth_failed");
        return;
      }

      // Use the same production redirect URI as auth-url endpoint
      const redirectUri = `${getAppBaseUrl()}/api/google/callback`;

      const tokens = await exchangeCodeForTokens(code, redirectUri);
      if (!tokens) {
        res.redirect("/settings?error=token_exchange_failed");
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      await updateUserData(userId, {
        googleTokens: tokens,
        settings: { ...userData.settings, googlePhotosConnected: true, photoSource: "google_photos" },
      });

      res.redirect("/photos?success=google_connected");
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("/photos?error=callback_failed");
    }
  });

  // Comprehensive diagnostic endpoint for Google Photos debugging
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/google/status", async (req: Request, res: Response) => {
      try {
        const userId = req.headers["x-clerk-user-id"] as string;

        if (!userId) {
          res.json({ 
            authenticated: false, 
            reason: "No Clerk session - please sign in" 
          });
          return;
        }

        const userData = await getUserData(userId);
        
        if (!userData) {
          res.json({ 
            authenticated: true,
            userId: userId.substring(0, 8) + "...",
            googleConnected: false,
            reason: "User data not found in database"
          });
          return;
        }

        const hasTokens = !!userData.googleTokens;
        const hasAccessToken = !!userData.googleTokens?.accessToken;
        const hasRefreshToken = !!userData.googleTokens?.refreshToken;
        const tokenExpiry = userData.googleTokens?.expiresAt;
        const isExpired = tokenExpiry ? Date.now() > tokenExpiry : true;
        const settingConnected = userData.settings?.googlePhotosConnected;

        // Try to get a valid token (will refresh if expired)
        let validToken: string | null = null;
        let tokenRefreshed = false;
        if (hasTokens) {
          validToken = await getValidGoogleToken(userData);
          tokenRefreshed = validToken !== userData.googleTokens?.accessToken;
        }

        // Test the token by fetching albums
        let albumTest: any = { tested: false };
        if (validToken) {
          try {
            const response = await fetch("https://photoslibrary.googleapis.com/v1/albums?pageSize=5", {
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
              headers: { Authorization: `Bearer ${validToken}` }
            });
            const rawText = await response.text();
            
            let data: any = {};
            try {
              data = JSON.parse(rawText);
            } catch (e) {
              data = { parseError: "Failed to parse response", raw: rawText.substring(0, 200) };
            }
            
            albumTest = {
              tested: true,
              status: response.status,
              statusText: response.statusText,
              albumCount: data.albums?.length || 0,
              hasAlbumsField: "albums" in data,
              error: data.error?.message,
              errorCode: data.error?.code,
              errorStatus: data.error?.status,
              firstAlbumTitle: data.albums?.[0]?.title,
              rawResponsePreview: rawText.substring(0, 300)
            };
          } catch (e: any) {
            console.error("[Google Status] Albums API test error:", e);
            albumTest = { tested: true, error: e.message };
          }
        }

        // Check what scopes the token actually has
        let tokenInfo: any = { tested: false };
        if (validToken) {
          try {
            const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${validToken}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            const rawText = await response.text();
            
            let data: any = {};
            try {
              data = JSON.parse(rawText);
            } catch (e) {
              data = { parseError: "Failed to parse", raw: rawText.substring(0, 200) };
            }
            
            tokenInfo = {
              tested: true,
              status: response.status,
              scope: data.scope,
              scopeList: data.scope?.split(" ") || [],
              hasPhotosReadonly: data.scope?.includes("photoslibrary.readonly") || false,
              hasPhotosSharing: data.scope?.includes("photoslibrary.sharing") || false,
              expiresIn: data.expires_in,
              error: data.error,
              errorDescription: data.error_description
            };
          } catch (e: any) {
            tokenInfo = { tested: true, error: e.message };
          }
        }

        // Also test shared albums
        let sharedAlbumTest: any = { tested: false };
        if (validToken) {
          try {
            const response = await fetch("https://photoslibrary.googleapis.com/v1/sharedAlbums?pageSize=5", {
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
              headers: { Authorization: `Bearer ${validToken}` }
            });
            const rawText = await response.text();
            
            let data: any = {};
            try {
              data = JSON.parse(rawText);
            } catch (e) {
              data = { parseError: "Failed to parse response", raw: rawText.substring(0, 200) };
            }
            
            sharedAlbumTest = {
              tested: true,
              status: response.status,
              sharedAlbumCount: data.sharedAlbums?.length || 0,
              hasSharedAlbumsField: "sharedAlbums" in data,
              error: data.error?.message,
            };
          } catch (e: any) {
            sharedAlbumTest = { tested: true, error: e.message };
          }
        }

        res.json({
          authenticated: true,
          userId: userId.substring(0, 8) + "...",
          googleConnected: hasTokens,
          hasAccessToken,
          hasRefreshToken,
          tokenExpired: isExpired,
          tokenRefreshed,
          settingConnected,
          expiresIn: tokenExpiry ? Math.round((tokenExpiry - Date.now()) / 1000) + "s" : "N/A",
          currentTime: new Date().toISOString(),
          tokenExpiryTime: tokenExpiry ? new Date(tokenExpiry).toISOString() : "N/A",
          tokenInfo,
          albumTest,
          sharedAlbumTest,
          diagnosis: getDiagnosis(albumTest, sharedAlbumTest, tokenInfo, hasTokens, isExpired, validToken)
        });
      } catch (error: any) {
        console.error("[Google Status] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Helper function to provide diagnosis
  function getDiagnosis(albumTest: any, sharedAlbumTest: any, tokenInfo: any, hasTokens: boolean, isExpired: boolean, validToken: string | null): string {
    if (!hasTokens) return "No Google tokens stored. User needs to connect Google Photos.";
    if (!validToken) return "Token refresh failed. User may need to reconnect Google Photos.";
    
    // Check if token has the required scopes
    if (tokenInfo?.tested && !tokenInfo.hasPhotosReadonly) {
      return "TOKEN MISSING SCOPES: Your access token does not have photoslibrary.readonly scope. The OAuth consent may not have granted it. Check tokenInfo.scope field. You may need to revoke access in your Google Account settings and reconnect.";
    }
    
    if (albumTest.status === 403) return "403 Forbidden - Token exists but lacks permissions. Check tokenInfo.scope to see what scopes were actually granted.";
    if (albumTest.status === 401) return "401 Unauthorized - Token is invalid. User needs to reconnect Google Photos.";
    if (albumTest.status === 200 && albumTest.albumCount === 0 && sharedAlbumTest.sharedAlbumCount === 0) return "API working but no albums found. User may have no albums in Google Photos.";
    if (albumTest.status === 200 && albumTest.albumCount > 0) return "Everything working! Albums found successfully.";
    if (albumTest.error) return `API Error: ${albumTest.error}`;
    return "Unknown state - check raw response data.";
  }

  // ============================================
  // Google Photos Picker API Endpoints
  // ============================================

  // Create a new picker session - returns pickerUri for user to select photos
  app.post("/api/google/picker/session", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const accessToken = await getValidGoogleToken(userData);

      if (!accessToken) {
        res.status(401).json({ error: "Google Photos not connected" });
        return;
      }

      const session = await createPickerSession(accessToken);
      if (!session) {
        res.status(500).json({ error: "Failed to create picker session" });
        return;
      }

      res.json(session);
    } catch (error) {
      console.error("[Picker] Create session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get/poll picker session status - when complete, merge photos into persistent list
  app.get("/api/google/picker/session/:sessionId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { sessionId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const accessToken = await getValidGoogleToken(userData);

      if (!accessToken) {
        res.status(401).json({ error: "Google Photos not connected" });
        return;
      }

      const session = await getPickerSession(accessToken, sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // If session is complete, merge photos into persistent list
      if (session.mediaItemsSet) {
        const photos = await getPickedMediaItems(accessToken, sessionId);

        // Get existing photos and merge (dedupe by ID)
        const existingPhotos = userData.settings?.selectedPhotos || [];
        const existingById = new Map(existingPhotos.map(p => [p.id, p]));

        // Cache bytes for new photos and for old ones that were never cached
        const toCache = photos.filter(p => !existingById.get(p.id)?.cachedAt);
        const cachedIds = new Set(
          await photoCache.cachePhotos(
            userId,
            toCache.map(p => ({ id: p.id, baseUrl: p.baseUrl, mimeType: p.mimeType })),
            accessToken,
          ),
        );

        const now = Date.now();
        const upgradedExisting = existingPhotos.map(p =>
          !p.cachedAt && cachedIds.has(p.id) ? { ...p, cachedAt: now } : p,
        );
        const newPhotos = photos
          .filter(p => !existingById.has(p.id))
          .map(p => ({
            id: p.id,
            filename: p.filename,
            mimeType: p.mimeType,
            creationTime: p.creationTime,
            addedAt: now,
            // RTDB rejects undefined, so only include cachedAt on success
            ...(cachedIds.has(p.id) ? { cachedAt: now } : {}),
          }));

        const mergedPhotos = [...upgradedExisting, ...newPhotos];

        // Update user settings with merged photos; only now does this session become the active one
        await updateUserData(userId, {
          settings: {
            ...userData.settings,
            selectedPhotos: mergedPhotos,
            pickerSessionId: sessionId,
          },
        });
      }

      res.json(session);
    } catch (error) {
      console.error("[Picker] Get session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current picker session for user and photo count
  app.get("/api/google/picker/current", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const selectedPhotos = userData.settings?.selectedPhotos || [];
      const hasPhotos = selectedPhotos.length > 0;

      // Return info about persistent photos even if session is gone
      res.json({ 
        hasSession: hasPhotos, 
        photoCount: selectedPhotos.length,
        session: hasPhotos ? { mediaItemsSet: true } : null 
      });
    } catch (error) {
      console.error("[Picker] Get current session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Disconnect Google Photos
  app.delete("/api/google/disconnect", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Clear Google tokens and update settings
      // Use null to remove the field in Firebase (undefined not allowed)
      await updateUserData(userId, {
        googleTokens: null,
        settings: { 
          ...userData.settings, 
          googlePhotosConnected: false,
          selectedAlbums: []
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Google disconnect error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get photos from user's persistent collection (refresh URLs from active session)
  // Always returns consistent shape: { photos, storedCount, sessionActive, needsSessionRefresh }
  app.get("/api/photos", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const selectedPhotos = userData.settings?.selectedPhotos || [];

      if (selectedPhotos.length === 0) {
        res.json({ photos: [], storedCount: 0, sessionActive: false, needsSessionRefresh: false });
        return;
      }

      const cachedStored = selectedPhotos.filter((p: StoredPhoto) => p.cachedAt);
      const uncachedStored = selectedPhotos.filter((p: StoredPhoto) => !p.cachedAt);

      const cachedPhotos: GooglePhotoItem[] = cachedStored.map((stored: StoredPhoto) => ({
        id: stored.id,
        baseUrl: `/api/photos/${encodeURIComponent(stored.id)}/image`,
        filename: stored.filename,
        mimeType: stored.mimeType,
        creationTime: stored.creationTime,
        fetchedAt: stored.cachedAt as number,
        cached: true,
      }));

      let livePhotos: GooglePhotoItem[] = [];
      let sessionActive = false;
      let sessionError: string | undefined;

      // Only touch Google when some photos still depend on a live picker session
      if (uncachedStored.length > 0) {
        const accessToken = await getValidGoogleToken(userData);
        if (!accessToken) {
          sessionError = "Google Photos not connected";
        } else {
          const sessionId = userData.settings?.pickerSessionId;
          let freshPhotos: GooglePhotoItem[] = [];
          if (sessionId) {
            try {
              const session = await getPickerSession(accessToken, sessionId);
              if (session?.mediaItemsSet) {
                freshPhotos = await getPickedMediaItems(accessToken, sessionId);
                sessionActive = true;
              } else {
                sessionError = "Session not ready";
              }
            } catch {
              // Session may be expired
              sessionError = "Session expired";
            }
          } else {
            sessionError = "No session ID stored";
          }

          const freshUrlMap = new Map(freshPhotos.map(p => [p.id, p]));
          const now = Date.now();
          livePhotos = uncachedStored
            .map((stored: StoredPhoto): GooglePhotoItem => {
              const fresh = freshUrlMap.get(stored.id);
              return {
                id: stored.id,
                baseUrl: fresh?.baseUrl || "",
                filename: stored.filename,
                mimeType: stored.mimeType,
                creationTime: stored.creationTime,
                fetchedAt: fresh ? now : 0,
              };
            })
            .filter((p: GooglePhotoItem) => p.baseUrl);
        }
      }

      const displayablePhotos = [...cachedPhotos, ...livePhotos];
      const needsSessionRefresh = displayablePhotos.length === 0 && selectedPhotos.length > 0;

      console.log("[Photos] Retrieved", displayablePhotos.length, "displayable photos,", selectedPhotos.length, "stored,", cachedPhotos.length, "cached, session active:", sessionActive, sessionError ? `(${sessionError})` : "");

      res.json({
        photos: displayablePhotos,
        storedCount: selectedPhotos.length,
        uncachedCount: uncachedStored.length,
        sessionActive,
        needsSessionRefresh,
        ...(sessionError && { sessionError }),
      });
    } catch (error) {
      console.error("[Photos] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stream the requesting user's cached image bytes
  app.get("/api/photos/:photoId/image", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const cached = await photoCache.getCachedPhoto(userId, req.params.photoId);
      if (!cached) {
        res.status(404).json({ error: "Photo not cached" });
        return;
      }

      res.setHeader("Content-Type", cached.mimeType);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.send(cached.buffer);
    } catch (error) {
      console.error("[Photos] Cached image error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Refresh a single photo's baseUrl (for handling 60-minute expiration)
  app.get("/api/photos/:mediaItemId/refresh", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { mediaItemId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const accessToken = await getValidGoogleToken(userData);

      if (!accessToken) {
        res.status(401).json({ error: "Google Photos not connected" });
        return;
      }

      const sessionId = userData.settings?.pickerSessionId;
      if (!sessionId) {
        res.status(404).json({ error: "No picker session" });
        return;
      }

      const result = await refreshPickerPhotoUrl(accessToken, mediaItemId, sessionId);
      if (!result) {
        res.status(404).json({ error: "Photo not found" });
        return;
      }

      res.json(result);
    } catch (error) {
      console.error("[Photos] Refresh error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete all photos or a specific photo from persistent collection
  app.delete("/api/photos/:photoId?", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { photoId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const existingPhotos = userData.settings?.selectedPhotos || [];

      let updatedPhotos: StoredPhoto[];
      if (photoId && photoId !== "all") {
        updatedPhotos = existingPhotos.filter((p: StoredPhoto) => p.id !== photoId);
      } else {
        updatedPhotos = [];
      }

      await updateUserData(userId, {
        settings: {
          ...userData.settings,
          selectedPhotos: updatedPhotos,
        },
      });

      if (photoId && photoId !== "all") {
        await photoCache.removeCachedPhoto(userId, photoId);
      } else {
        await photoCache.removeAllCachedPhotos(userId);
      }

      res.json({ success: true, count: updatedPhotos.length });
    } catch (error) {
      console.error("[Photos] Delete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const MAX_PROXY_BYTES = 15 * 1024 * 1024;

  // Proxy endpoint to serve Google Photos images (they require OAuth token)
  app.get("/api/photos/proxy", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const photoUrl = req.query.url as string;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!photoUrl) {
        res.status(400).json({ error: "Missing photo URL" });
        return;
      }

      if (!isAllowedGooglePhotoUrl(photoUrl)) {
        res.status(400).json({ error: "Invalid photo URL" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const accessToken = await getValidGoogleToken(userData);

      if (!accessToken) {
        res.status(401).json({ error: "Google Photos not connected" });
        return;
      }

      // Fetch the image from Google Photos with OAuth token; never follow redirects
      // (the token must not be forwarded to another host).
      const imageResponse = await fetch(photoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      if (!imageResponse.ok) {
        console.error("[Photo Proxy] Failed to fetch image:", imageResponse.status);
        res.status(imageResponse.status >= 300 && imageResponse.status < 400 ? 502 : imageResponse.status).json({ error: "Failed to fetch image" });
        return;
      }

      const declaredLength = Number(imageResponse.headers.get("content-length"));
      if (declaredLength > MAX_PROXY_BYTES) {
        res.status(413).json({ error: "Image too large" });
        return;
      }

      // Get content type and stream the image
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");

      // Read the body with a streamed byte cap
      const chunks: Buffer[] = [];
      let total = 0;
      if (imageResponse.body) {
        const reader = imageResponse.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_PROXY_BYTES) {
            await reader.cancel();
            res.removeHeader("Content-Type");
            res.removeHeader("Cache-Control");
            res.status(413).json({ error: "Image too large" });
            return;
          }
          chunks.push(Buffer.from(value));
        }
      }
      res.send(Buffer.concat(chunks));
    } catch (error) {
      console.error("[Photo Proxy] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Pixabay ambient photos endpoint
  const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
  const AMBIENT_TAGS = [
    "nature", "landscape", "mountains", "forest", "ocean", "sunset",
    "zen", "minimalist", "fog", "abstract", "macro", "bokeh",
    "cityscape", "scandinavia", "village", "interior",
    "autumn colors", "winter landscape", "spring flowers", "summer beach"
  ];

  const pixabayCache = new Map<string, { expires: number; body: unknown }>();

  app.get("/api/pixabay/photos", async (req: Request, res: Response) => {
    try {
      if (!req.headers["x-clerk-user-id"]) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!PIXABAY_API_KEY) {
        res.status(500).json({ error: "Pixabay API key not configured" });
        return;
      }

      // Get optional tag from query or pick random from ambient tags
      const requestedTag = req.query.tag as string;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const perPage = Math.min(Math.max(1, parseInt(req.query.per_page as string) || 20), PIXABAY_MAX_PER_PAGE);

      // Pick a random ambient tag if none provided
      const tag = requestedTag || AMBIENT_TAGS[Math.floor(Math.random() * AMBIENT_TAGS.length)];

      const cacheKey = `${tag}\u0000${page}\u0000${perPage}`;
      const hit = pixabayCache.get(cacheKey);
      if (hit && hit.expires > Date.now()) {
        res.json(hit.body);
        return;
      }

      const params = new URLSearchParams({
        key: PIXABAY_API_KEY,
        q: tag,
        image_type: "photo",
        orientation: "horizontal",
        editors_choice: "true",
        safesearch: "true",
        min_width: "1920",
        per_page: String(perPage),
        page: String(page),
      });

      const response = await fetch(`https://pixabay.com/api/?${params.toString()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      
      if (!response.ok) {
        console.error("Pixabay API error:", response.status, response.statusText);
        res.status(response.status).json({ error: "Failed to fetch from Pixabay" });
        return;
      }

      const data = await response.json() as {
        totalHits: number;
        hits: Array<{
          id: number;
          webformatURL: string;
          largeImageURL: string;
          fullHDURL?: string;
          imageWidth: number;
          imageHeight: number;
          tags: string;
          user: string;
        }>;
      };

      // Transform response to our schema
      const photos = data.hits.map(hit => ({
        id: hit.id,
        webformatURL: hit.webformatURL,
        largeImageURL: hit.largeImageURL,
        fullHDURL: hit.fullHDURL,
        imageWidth: hit.imageWidth,
        imageHeight: hit.imageHeight,
        tags: hit.tags,
        user: hit.user,
      }));

      const body = {
        photos,
        total: data.totalHits,
        tag,
        page,
      };
      const now = Date.now();
      pixabayCache.forEach((entry, key) => {
        if (entry.expires <= now) pixabayCache.delete(key);
      });
      pixabayCache.set(cacheKey, { expires: now + PIXABAY_CACHE_TTL_MS, body });
      res.json(body);
    } catch (error) {
      console.error("Pixabay API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get available ambient tags for Pixabay
  app.get("/api/pixabay/tags", (_req: Request, res: Response) => {
    res.json({ tags: AMBIENT_TAGS });
  });

  registerShoppingRoutes(app);
  registerNotepadRoutes(app);
  registerMessagesRoutes(app);
  registerChoresRoutes(app);
  registerRecipesRoutes(app);
  // ============================================
  // YOUTUBE VIDEO INFO ENDPOINTS
  // ============================================

  // Get YouTube video info (title, thumbnail) using oEmbed
  app.get("/api/youtube/video/:videoId", asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;

    if (!videoId || videoId.length !== 11) {
      res.status(400).json({ error: "Invalid video ID" });
      return;
    }

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

      if (!response.ok) {
        res.status(404).json({ error: "Video not found" });
        return;
      }

      const data = await response.json();
      res.json({
        videoId,
        title: data.title,
        thumbnail: data.thumbnail_url,
        author: data.author_name,
      });
    } catch (error) {
      console.error("YouTube video info error:", error);
      res.status(500).json({ error: "Failed to fetch video info" });
    }
  }));

  // Get multiple YouTube video infos at once
  app.post("/api/youtube/videos", asyncHandler(async (req: Request, res: Response) => {
    const { videoIds } = req.body;

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      res.status(400).json({ error: "videoIds array is required" });
      return;
    }

    if (videoIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 videos per request" });
      return;
    }

    const results = await Promise.allSettled(
      videoIds.map(async (videoId: string) => {
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

          if (!response.ok) {
            return { videoId, title: `Track`, error: "not found" };
          }

          const data = await response.json();
          return {
            videoId,
            title: data.title,
            thumbnail: data.thumbnail_url,
          };
        } catch {
          return { videoId, title: `Track`, error: "fetch failed" };
        }
      })
    );

    const videos = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return { videoId: videoIds[index], title: `Track ${index + 1}`, error: "failed" };
    });

    res.json({ videos });
  }));

  // ============================================
  // CUSTOM PLAYLISTS ENDPOINTS
  // ============================================

  // Get user's custom playlists
  app.get("/api/playlists", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const playlists = toArray(userData.settings?.customPlaylists || []);
    res.json(playlists);
  }));

  // Create a new custom playlist
  app.post("/api/playlists", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsedBody = createPlaylistSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid playlist", details: parsedBody.error.errors });
      return;
    }
    const { name, description, iconHint, colorTheme, videoIds } = parsedBody.data;

    const userData = await getOrCreateUser(userId, username);
    const playlists = toArray(userData.settings?.customPlaylists || []);

    const newPlaylist = {
      id: randomUUID(),
      name,
      description: description || "",
      iconHint: iconHint || "music",
      colorTheme: colorTheme || "#E91E63",
      videoIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    playlists.push(newPlaylist);

    await updateUserData(userId, {
      settings: {
        ...userData.settings,
        customPlaylists: playlists,
      },
    });

    res.json(newPlaylist);
  }));

  // Update a custom playlist
  app.patch("/api/playlists/:playlistId", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";
    const { playlistId } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Schema strips id/createdAt/updatedAt and unknown keys
    const parsedUpdates = updatePlaylistSchema.safeParse(req.body);
    if (!parsedUpdates.success) {
      res.status(400).json({ error: "Invalid playlist update", details: parsedUpdates.error.errors });
      return;
    }
    const updates = parsedUpdates.data;

    const userData = await getOrCreateUser(userId, username);
    const playlists = toArray(userData.settings?.customPlaylists || []);

    const index = playlists.findIndex((p: any) => p.id === playlistId);
    if (index === -1) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    playlists[index] = {
      ...playlists[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await updateUserData(userId, {
      settings: {
        ...userData.settings,
        customPlaylists: playlists,
      },
    });

    res.json(playlists[index]);
  }));

  // Delete a custom playlist
  app.delete("/api/playlists/:playlistId", asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    const username = req.headers["x-clerk-username"] as string || "user";
    const { playlistId } = req.params;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const playlists = toArray(userData.settings?.customPlaylists || []);

    const filtered = playlists.filter((p: any) => p.id !== playlistId);

    if (filtered.length === playlists.length) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    await updateUserData(userId, {
      settings: {
        ...userData.settings,
        customPlaylists: filtered,
      },
    });

    res.json({ success: true });
  }));

  return httpServer;
}
