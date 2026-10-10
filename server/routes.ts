import type { Express, Request, Response } from "express";
import { registerMcpRoutes } from "./mcp";
import { registerShoppingRoutes } from "./apps/shopping";
import { registerNotepadRoutes } from "./apps/notepad";
import { registerMessagesRoutes } from "./apps/messages";
import { registerChoresRoutes } from "./apps/chores";
import { registerRecipesRoutes } from "./apps/recipes";
import { registerWeatherRoutes } from "./apps/weather";
import { registerCalendarRoutes } from "./apps/calendar";
import { registerEventsRoutes } from "./apps/events";
import { registerStocksRoutes } from "./apps/stocks";
import { registerBabySongsRoutes } from "./apps/baby-songs";
import { registerPhotosRoutes } from "./apps/photos";
import { registerRadioRoutes } from "./apps/radio";
import { registerTvRoutes } from "./apps/tv";
import { registerMediaProxyRoutes } from "./media-proxy";
import { registerMailRoutes } from "./mail-routes";
import { registerDataRoutes } from "./data-routes";
import { registerHouseholdRoutes } from "./household-routes";
import { registerMediaRoutes } from "./media-routes";
import { FETCH_TIMEOUT_MS, PUBLIC_CACHE_TTL_MS, memoTTL, discardBody } from "./route-helpers";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { getUserData, setUserData, updateUserData, getUserByUsername } from "./firebase";
import { asyncHandler, getOrCreateUser, toArray, type UserData } from "./middleware";
import { z } from "zod";
import { calendarService, CalendarError } from "./calendar-service";
import { createApiToken, listApiTokens, revokeApiToken, firebaseTokenStore, ApiTokenError, API_TOKEN_SCOPES } from "./api-tokens";

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


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerMcpRoutes(app);
  registerMailRoutes(app);
  registerDataRoutes(app);
  registerMediaRoutes(app);

  // Config endpoint - provides environment-specific settings to frontend
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      clerkPublishableKey: getClerkPublishableKey(),
    });
  });

  registerWeatherRoutes(app);

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

  registerHouseholdRoutes(app);

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

  registerCalendarRoutes(app);
  registerEventsRoutes(app);

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
          location: connectedUserData.settings?.location
            ? { city: connectedUserData.settings.location.city, country: connectedUserData.settings.location.country }
            : undefined,
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

  registerMediaProxyRoutes(app);
  registerRadioRoutes(app);
  registerTvRoutes(app);

  registerStocksRoutes(app);

  registerPhotosRoutes(app);

  registerShoppingRoutes(app);
  registerNotepadRoutes(app);
  registerMessagesRoutes(app);
  registerChoresRoutes(app);
  registerRecipesRoutes(app);
  registerBabySongsRoutes(app);

  return httpServer;
}
