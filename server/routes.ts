import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { initializeFirebase, getUserData, setUserData, updateUserData, getUserByUsername, setSharedNote, deleteSharedNote, getAllSharedNotes } from "./firebase";
import { asyncHandler, getOrCreateUser, toArray, type UserData } from "./middleware";

// Secret for signing OAuth state - use SESSION_SECRET or fallback
const STATE_SECRET = process.env.SESSION_SECRET || "oauth-state-secret-fallback";

// Sign data with HMAC for OAuth state security
function signState(data: string): string {
  const hmac = createHmac("sha256", STATE_SECRET);
  hmac.update(data);
  return hmac.digest("base64url");
}

// Verify HMAC signature using timing-safe comparison
function verifyState(data: string, signature: string): boolean {
  try {
    const expectedSignature = signState(data);
    const sigBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expectedSignature, "base64url");
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
import { getWeather, reverseGeocode, geocodeCity } from "./weather";
import { getGoogleAuthUrl, exchangeCodeForTokens, refreshAccessToken, createPickerSession, getPickerSession, getPickedMediaItems, deletePickerSession, refreshPickerPhotoUrl } from "./google-photos";
import type {
  CalendarEvent,
  Person,
  UserSettings,
  ConnectedUser,
  ConnectionRequest,
  InsertCalendarEvent,
  InsertPerson,
  Note,
  InsertNote,
  Message,
  InsertMessage,
  GooglePhotoItem,
  StoredPhoto,
} from "@shared/schema";
import { insertCalendarEventSchema, insertPersonSchema, insertNoteSchema, insertMessageSchema, ConnectionStatus, PhotoSource, EventType } from "@shared/schema";

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

initializeFirebase();

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Config endpoint - provides environment-specific settings to frontend
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      clerkPublishableKey: getClerkPublishableKey(),
    });
  });

  app.get("/api/weather", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);

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

    const userData = await getOrCreateUser(userId, username);
    const updatedSettings = { ...userData.settings, ...req.body };

    await updateUserData(userId, { settings: updatedSettings });

    res.json(updatedSettings);
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

    const { name, birthday } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const userData = await getOrCreateUser(userId, username);
    const updatedPeople = (userData.people || []).map((p) => {
      if (p.id === personId) {
        return { ...p, name, birthday: birthday || undefined };
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

  // Helper to normalize old event schema to current schema
  function normalizeEvent(event: any, defaultCreatorId?: string, defaultCreatorName?: string): CalendarEvent {
    return {
      id: event.id,
      title: event.title || "",
      startDate: event.startDate || event.start || "",
      endDate: event.endDate || event.end || "",
      type: event.type || EventType.SHARED,
      people: Array.isArray(event.people) ? event.people : [],
      creatorId: event.creatorId || defaultCreatorId,
      creatorName: event.creatorName || defaultCreatorName,
    };
  }

  app.get("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const rawEvents = userData.events || [];
      const defaultCreatorName = userData.settings?.homeName || username;
      
      // Normalize all events to current schema (with this user as default creator for old events)
      const normalizedEvents = rawEvents.map((e: any) => normalizeEvent(e, userId, defaultCreatorName));
      
      // If any events were normalized, save them back
      const needsMigration = rawEvents.some((e: any) => e.start || e.end || !Array.isArray(e.people) || !e.creatorId);
      if (needsMigration) {
        await updateUserData(userId, { events: normalizedEvents });
      }
      
      const allEvents = [...normalizedEvents];

      for (const connectedUserId of userData.connections || []) {
        const connectedUserData = await getUserData(connectedUserId);
        if (connectedUserData?.events) {
          const connectedCreatorName = connectedUserData.settings?.homeName || connectedUserData.username || "Connected Home";
          const sharedEvents = connectedUserData.events
            .map((e: any) => normalizeEvent(e, connectedUserId, connectedCreatorName))
            .filter((e: CalendarEvent) => e.type === "Shared");
          allEvents.push(...sharedEvents);
        }
      }

      res.json(allEvents);
    } catch (error) {
      console.error("Calendar events error:", error);
      res.status(500).json({ error: "Internal server error" });
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

      const userData = await getOrCreateUser(userId, username);
      const creatorName = userData.settings?.homeName || username;

      const newEvent: CalendarEvent = {
        id: randomUUID(),
        ...parseResult.data,
        creatorId: userId,
        creatorName: creatorName,
      };

      const updatedEvents = [...(userData.events || []), newEvent];
      await updateUserData(userId, { events: updatedEvents });

      res.json(newEvent);
    } catch (error) {
      console.error("Calendar create error:", error);
      res.status(500).json({ error: "Internal server error" });
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

      const userData = await getOrCreateUser(userId, username);
      const events = userData?.events || [];

      const eventIndex = events.findIndex((e: CalendarEvent) => e.id === eventId);
      if (eventIndex === -1) {
        res.status(403).json({ error: "You can only edit your own events" });
        return;
      }

      const existingEvent = events[eventIndex];
      const updatedEvent: CalendarEvent = {
        id: eventId,
        ...parseResult.data,
        creatorId: existingEvent.creatorId || userId,
        creatorName: existingEvent.creatorName || userData.settings?.homeName || username,
      };

      events[eventIndex] = updatedEvent;
      await updateUserData(userId, { events });

      res.json(updatedEvent);
    } catch (error) {
      console.error("Calendar update error:", error);
      res.status(500).json({ error: "Internal server error" });
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

      const userData = await getOrCreateUser(userId, username);
      const events = userData?.events || [];

      // Check if event exists in user's own events (they can only delete their own)
      const eventExists = events.some((e: CalendarEvent) => e.id === eventId);
      if (!eventExists) {
        res.status(403).json({ error: "You can only delete your own events" });
        return;
      }

      const updatedEvents = events.filter((e: CalendarEvent) => e.id !== eventId);
      await updateUserData(userId, { events: updatedEvents });

      res.json({ success: true });
    } catch (error) {
      console.error("Calendar delete error:", error);
      res.status(500).json({ error: "Internal server error" });
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

      const userData = await getOrCreateUser(userId, username);
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

      for (const connectedUserId of connectionIds) {
        const connectedUserData = await getUserData(connectedUserId);
        if (connectedUserData) {
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

          connectionsWithWeather.push(entry);
        }
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
      const response = await fetch(streamUrl, {
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

      // Pipe the stream
      const reader = response.body.getReader();
      
      const pump = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        } catch (e) {
          res.end();
        }
      };

      // Handle client disconnect
      req.on("close", () => {
        reader.cancel();
      });

      await pump();
    } catch (error) {
      console.error("Media proxy error:", error);
      if (!res.headersSent) {
        res.status(502).json({ error: "Stream error" });
      }
    }
  });

  // Radio stations organized by category (countries + genres) with icons
  app.get("/api/radio/stations", async (_req: Request, res: Response) => {
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

    // Helper to check if a URL is reachable
    async function checkUrl(url: string): Promise<boolean> {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        // Try HEAD first
        const response = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (response.status === 200 || response.status === 302 || response.status === 405) {
          return true;
        }
      } catch {
        // HEAD failed, continue to GET
      }

      // Try GET for streams that don't support HEAD
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);

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

    res.json(result);
  });

  // TV channels health check - tests which channels are accessible
  // Organized by region with Bulgaria first, then World News, then alphabetically by region
  app.get("/api/tv/channels", async (_req: Request, res: Response) => {
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(channel.url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);
        
        return response.status === 200 || response.status === 302 || response.status === 405;
      } catch {
        // Try GET for streams that don't support HEAD
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch(channel.url, {
            method: "GET",
            signal: controller.signal,
            redirect: "follow",
          });
          clearTimeout(timeout);
          
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

    res.json(result);
  });

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

  // Radio metadata endpoint - fetches ICY stream metadata (now playing info)
  app.get("/api/radio/metadata", async (req: Request, res: Response) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).json({ error: "Missing stream URL" });
    }

    try {
      // Create abort controller with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // Request stream with ICY metadata header
      const response = await fetch(streamUrl, {
        method: "GET",
        headers: {
          "Icy-MetaData": "1",
          "User-Agent": "FamilyFrame/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

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
              const maxBytes = metaInterval + 4096; // Read metadata interval + some extra

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
              reader.cancel();
            }
          } catch {
            // Ignore metadata parsing errors
          }
        }
      }

      // Close the stream
      if (response.body) {
        try {
          const reader = response.body.getReader();
          await reader.cancel();
        } catch {}
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
      if (error.name === "AbortError") {
        return res.status(504).json({ error: "Timeout fetching stream metadata" });
      }
      console.error("[Radio Metadata] Error:", error.message);
      res.status(500).json({ error: "Failed to fetch stream metadata" });
    }
  });

  // Market data endpoint - fetches all requested stocks with historical performance
  app.get("/api/market", async (req: Request, res: Response) => {
    try {
      const symbolsParam = req.query.symbols as string || "DJI,BTC";
      const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

      const stockConfig: Record<string, { yahooSymbol?: string; isCrypto?: boolean; name: string }> = {
        "DJI": { yahooSymbol: "^DJI", name: "Dow Jones" },
        "VNQ": { yahooSymbol: "VNQ", name: "Real Estate" },
        "BTC": { isCrypto: true, name: "Bitcoin" },
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
        change1Y?: number;
        change3Y?: number;
        change5Y?: number;
      }

      const results: Record<string, MarketResult | null> = {};

      // Build fetch requests - now fetching 5 year data for historical analysis
      const fetchPromises: Promise<{ symbol: string; data: any; historical?: any }>[] = [];

      for (const symbol of symbols) {
        const config = stockConfig[symbol];
        if (!config) continue;

        if (config.isCrypto) {
          // Fetch current price and historical data for Bitcoin
          fetchPromises.push(
            Promise.all([
              fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true")
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
              fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1825&interval=daily")
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            ]).then(([data, historical]) => ({ symbol, data, historical }))
          );
        } else if (config.yahooSymbol) {
          // Fetch 5 year data for historical analysis
          fetchPromises.push(
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahooSymbol)}?interval=1mo&range=5y`)
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
          const result: MarketResult = {
            symbol,
            name: config.name,
            price: currentPrice,
            change: data.bitcoin.usd_24h_change || 0,
            changePercent: data.bitcoin.usd_24h_change || 0
          };

          // Calculate historical changes from CoinGecko market_chart data
          if (historical?.prices && historical.prices.length > 0) {
            const prices = historical.prices;
            const now = Date.now();
            const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
            const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60 * 1000;
            const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;

            // Find prices closest to 1Y, 3Y, 5Y ago
            const findPriceAtTime = (targetTime: number) => {
              let closest = prices[0];
              for (const p of prices) {
                if (Math.abs(p[0] - targetTime) < Math.abs(closest[0] - targetTime)) {
                  closest = p;
                }
              }
              return closest[1];
            };

            const price1YAgo = findPriceAtTime(oneYearAgo);
            const price3YAgo = findPriceAtTime(threeYearsAgo);
            const price5YAgo = prices[0]?.[1]; // First price in 5Y range

            if (price1YAgo) result.change1Y = ((currentPrice - price1YAgo) / price1YAgo) * 100;
            if (price3YAgo) result.change3Y = ((currentPrice - price3YAgo) / price3YAgo) * 100;
            if (price5YAgo) result.change5Y = ((currentPrice - price5YAgo) / price5YAgo) * 100;
          }

          results[symbol.toLowerCase()] = result;
        } else if (data.chart?.result?.[0]) {
          const chart = data.chart.result[0];
          const price = chart.meta?.regularMarketPrice;
          const prevClose = chart.meta?.previousClose || chart.meta?.chartPreviousClose;

          if (price && prevClose) {
            const change = price - prevClose;
            const result: MarketResult = {
              symbol,
              name: config.name,
              price,
              change,
              changePercent: (change / prevClose) * 100
            };

            // Calculate historical changes from Yahoo Finance monthly data
            const timestamps = chart.timestamp || [];
            const closes = chart.indicators?.quote?.[0]?.close || [];

            if (timestamps.length > 0 && closes.length > 0) {
              const now = Math.floor(Date.now() / 1000);
              const oneYearAgo = now - 365 * 24 * 60 * 60;
              const threeYearsAgo = now - 3 * 365 * 24 * 60 * 60;
              const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60;

              // Find prices closest to 1Y, 3Y, 5Y ago
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
                return closes[closestIdx];
              };

              const price1YAgo = findPriceAtTime(oneYearAgo);
              const price3YAgo = findPriceAtTime(threeYearsAgo);
              const price5YAgo = closes[0]; // First price in 5Y range

              if (price1YAgo) result.change1Y = ((price - price1YAgo) / price1YAgo) * 100;
              if (price3YAgo) result.change3Y = ((price - price3YAgo) / price3YAgo) * 100;
              if (price5YAgo) result.change5Y = ((price - price5YAgo) / price5YAgo) * 100;
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
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized - please sign in" });
        return;
      }

      // Always use production URL for Google OAuth to avoid redirect_uri_mismatch errors
      // This ensures the callback URL matches what's registered in Google Cloud Console
      const redirectUri = "https://family-frame.replit.app/api/google/callback";

      // Create a signed state to pass user ID through OAuth flow
      // This is needed because cookies may not be sent on cross-site redirects
      const stateData = { userId, username, ts: Date.now() };
      const stateJson = JSON.stringify(stateData);
      const stateBase64 = Buffer.from(stateJson).toString("base64url");
      const signature = signState(stateBase64);
      const signedState = `${stateBase64}.${signature}`;

      const authUrl = getGoogleAuthUrl(redirectUri, signedState);
      res.json({ url: authUrl });
    } catch (error) {
      console.error("Google auth URL error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const stateParam = req.query.state as string;

      if (!code) {
        res.redirect("/settings?error=no_code");
        return;
      }

      // Extract and verify user ID from signed state parameter (passed through OAuth flow)
      let userId: string | undefined;
      let username = "user";
      
      if (stateParam) {
        try {
          const [stateBase64, signature] = stateParam.split(".");

          if (!stateBase64 || !signature) {
            res.redirect("/settings?error=invalid_state");
            return;
          }

          // Verify the signature to prevent forged states
          if (!verifyState(stateBase64, signature)) {
            res.redirect("/settings?error=invalid_state");
            return;
          }

          const stateJson = Buffer.from(stateBase64, "base64url").toString();
          const stateData = JSON.parse(stateJson);

          // Check timestamp - reject if older than 10 minutes
          if (Date.now() - stateData.ts > 10 * 60 * 1000) {
            res.redirect("/settings?error=state_expired");
            return;
          }

          userId = stateData.userId;
          username = stateData.username || "user";
        } catch {
          res.redirect("/settings?error=invalid_state");
          return;
        }
      }

      if (!userId) {
        res.redirect("/settings?error=auth_failed");
        return;
      }

      // Use the same production redirect URI as auth-url endpoint
      const redirectUri = "https://family-frame.replit.app/api/google/callback";

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

      res.redirect("/settings?success=google_connected");
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("/settings?error=callback_failed");
    }
  });

  // Comprehensive diagnostic endpoint for Google Photos debugging
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
          const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${validToken}`);
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

      // Save the session ID to user settings
      await updateUserData(userId, {
        settings: {
          ...userData.settings,
          pickerSessionId: session.id,
        },
      });

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
        const existingIds = new Set(existingPhotos.map(p => p.id));

        const now = Date.now();
        const newPhotos = photos
          .filter(p => !existingIds.has(p.id))
          .map(p => ({
            id: p.id,
            filename: p.filename,
            mimeType: p.mimeType,
            creationTime: p.creationTime,
            addedAt: now,
          }));

        const mergedPhotos = [...existingPhotos, ...newPhotos];

        // Update user settings with merged photos
        await updateUserData(userId, {
          settings: {
            ...userData.settings,
            selectedPhotos: mergedPhotos,
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

      const accessToken = await getValidGoogleToken(userData);
      if (!accessToken) {
        // Return stored count even when not connected, so UI can show appropriate message
        res.json({
          photos: [],
          storedCount: selectedPhotos.length,
          sessionActive: false,
          needsSessionRefresh: true,
          error: "Google Photos not connected",
        });
        return;
      }

      // Get fresh URLs from the current session if available
      const sessionId = userData.settings?.pickerSessionId;
      let freshPhotos: GooglePhotoItem[] = [];
      let sessionActive = false;
      let sessionError: string | undefined;
      let needsSessionRefresh = false;

      if (sessionId) {
        try {
          const session = await getPickerSession(accessToken, sessionId);
          if (session?.mediaItemsSet) {
            freshPhotos = await getPickedMediaItems(accessToken, sessionId);
            sessionActive = true;
          } else {
            sessionError = "Session not ready";
            needsSessionRefresh = true;
          }
        } catch {
          // Session may be expired
          sessionError = "Session expired";
          needsSessionRefresh = true;
        }
      } else {
        sessionError = "No session ID stored";
        needsSessionRefresh = true;
      }

      // Build a map of fresh URLs by photo ID
      const freshUrlMap = new Map(freshPhotos.map(p => [p.id, p]));

      // Return ALL stored photos, with fresh URLs where available
      const now = Date.now();
      const photos: GooglePhotoItem[] = selectedPhotos.map(stored => {
        const fresh = freshUrlMap.get(stored.id);
        return {
          id: stored.id,
          baseUrl: fresh?.baseUrl || "", // Empty if no fresh URL available
          filename: stored.filename,
          mimeType: stored.mimeType,
          creationTime: stored.creationTime,
          fetchedAt: fresh ? now : 0,
        };
      });

      // Filter to only those with URLs for display
      const displayablePhotos = photos.filter(p => p.baseUrl);
      
      // If no fresh URLs but we have stored photos, return empty with session status
      if (displayablePhotos.length === 0 && selectedPhotos.length > 0) {
        res.json({ 
          photos: [], 
          storedCount: selectedPhotos.length,
          needsSessionRefresh: true 
        });
        return;
      }

      console.log("[Photos] Retrieved", displayablePhotos.length, "displayable photos,", selectedPhotos.length, "stored, session active:", sessionActive, sessionError ? `(${sessionError})` : "");

      res.json({
        photos: displayablePhotos,
        storedCount: selectedPhotos.length,
        sessionActive,
        needsSessionRefresh,
        ...(sessionError && { sessionError }),
      });
    } catch (error) {
      console.error("[Photos] Error:", error);
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

      res.json({ success: true, count: updatedPhotos.length });
    } catch (error) {
      console.error("[Photos] Delete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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

      const userData = await getOrCreateUser(userId, username);
      const accessToken = await getValidGoogleToken(userData);

      if (!accessToken) {
        res.status(401).json({ error: "Google Photos not connected" });
        return;
      }

      // Fetch the image from Google Photos with OAuth token
      const imageResponse = await fetch(photoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!imageResponse.ok) {
        console.error("[Photo Proxy] Failed to fetch image:", imageResponse.status);
        res.status(imageResponse.status).json({ error: "Failed to fetch image" });
        return;
      }

      // Get content type and stream the image
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3000"); // Cache for 50 minutes (URLs expire at 60)

      // Stream the response
      const arrayBuffer = await imageResponse.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
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

  app.get("/api/pixabay/photos", async (req: Request, res: Response) => {
    try {
      if (!PIXABAY_API_KEY) {
        res.status(500).json({ error: "Pixabay API key not configured" });
        return;
      }

      // Get optional tag from query or pick random from ambient tags
      const requestedTag = req.query.tag as string;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.per_page as string) || 20;
      
      // Pick a random ambient tag if none provided
      const tag = requestedTag || AMBIENT_TAGS[Math.floor(Math.random() * AMBIENT_TAGS.length)];

      const params = new URLSearchParams({
        key: PIXABAY_API_KEY,
        q: tag,
        image_type: "photo",
        orientation: "horizontal",
        editors_choice: "true",
        safesearch: "true",
        min_width: "1920",
        per_page: String(Math.min(perPage, 200)),
        page: String(page),
      });

      const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
      
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

      res.json({
        photos,
        total: data.totalHits,
        tag,
        page,
      });
    } catch (error) {
      console.error("Pixabay API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get available ambient tags for Pixabay
  app.get("/api/pixabay/tags", (_req: Request, res: Response) => {
    res.json({ tags: AMBIENT_TAGS });
  });

  // ===== SHOPPING LIST ENDPOINTS =====

  // Get shopping list
  app.get("/api/shopping", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const shoppingList = (userData as any).shoppingList || { items: [] };
      res.json(shoppingList);
    } catch (error) {
      console.error("Get shopping list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save shopping list
  app.post("/api/shopping", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { items } = req.body;
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { shoppingList: { items } });
      res.json({ success: true });
    } catch (error) {
      console.error("Save shopping list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== NOTEPAD ENDPOINTS =====

  // Get all notes for the user (own notes + shared notes from others)
  app.get("/api/notes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object (Firebase may convert arrays to objects)
      let myNotes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        myNotes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        myNotes = Object.values(userData.notes);
      }
      
      // Filter out any invalid notes
      myNotes = myNotes.filter((n: any) => n && n.id);
      
      // Sort own notes: pinned first, then by updatedAt descending
      const sortedMyNotes = [...myNotes].sort((a: Note, b: Note) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const dateA = new Date(a.updatedAt || 0).getTime();
        const dateB = new Date(b.updatedAt || 0).getTime();
        return dateB - dateA;
      });

      // Get list of connected user IDs (accepted connections only)
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      const connectedUserIds = new Set(connectionIds);

      // Get shared notes only from connected family members
      const allSharedNotes = await getAllSharedNotes();
      const sharedFromConnections = allSharedNotes
        .filter((note: Note) => {
          // Must be from a connected user and not from self
          return note.authorId && note.authorId !== userId && connectedUserIds.has(note.authorId);
        })
        .sort((a: Note, b: Note) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

      res.json({ mine: sortedMyNotes, shared: sharedFromConnections });
    } catch (error) {
      console.error("Get notes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new note
  app.post("/api/notes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const validatedData = insertNoteSchema.safeParse(req.body);
      if (!validatedData.success) {
        res.status(400).json({ error: "Invalid note data", details: validatedData.error.errors });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      const now = new Date().toISOString();
      
      const mentions = validatedData.data.mentions || [];
      
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      
      // Validate mentions are connected users
      const validMentions = mentions.filter((mentionId: string) => 
        connectionIds.includes(mentionId)
      );

      const newNote: Note = {
        id: randomUUID(),
        title: validatedData.data.title || "Untitled Note",
        content: validatedData.data.content || "",
        isPinned: validatedData.data.isPinned || false,
        isShared: validatedData.data.isShared || false,
        authorId: userId,
        authorName: username,
        createdAt: now,
        updatedAt: now,
        mentions: validMentions,
      };

      const notes = [...(userData.notes || []), newNote];
      await updateUserData(userId, { notes });

      // If shared, also add to sharedNotes collection
      if (newNote.isShared) {
        await setSharedNote(newNote.id, newNote);
      }

      // Send notification messages to mentioned households
      for (const mentionedUserId of validMentions) {
        const mentionedUserData = await getUserData(mentionedUserId);
        if (mentionedUserData) {
          const notificationMessage: Message = {
            id: randomUUID(),
            fromUserId: userId,
            fromUsername: username,
            toUserId: mentionedUserId,
            toUsername: mentionedUserData.username,
            content: `${username} mentioned you in a note: "${newNote.title}"`,
            createdAt: now,
            isRead: false,
            linkedNoteId: newNote.id,
          };
          
          // Handle messages as either array or object
          let recipientMsgs: Message[] = [];
          if (Array.isArray(mentionedUserData.messages)) {
            recipientMsgs = mentionedUserData.messages;
          } else if (mentionedUserData.messages && typeof mentionedUserData.messages === 'object') {
            recipientMsgs = Object.values(mentionedUserData.messages);
          }
          recipientMsgs.push(notificationMessage);
          await updateUserData(mentionedUserId, { messages: recipientMsgs });
        }
      }

      res.status(201).json(newNote);
    } catch (error) {
      console.error("Create note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update a note
  app.patch("/api/notes/:noteId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { noteId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object
      let notes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        notes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        notes = Object.values(userData.notes);
      }
      
      const noteIndex = notes.findIndex((n: Note) => n.id === noteId);

      if (noteIndex === -1) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      const { title, content, isPinned, isShared, mentions } = req.body;
      
      // Handle connections as either array or object
      let connectionIds: string[] = [];
      if (Array.isArray(userData.connections)) {
        connectionIds = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connectionIds = Object.values(userData.connections);
      }
      
      // Validate partial update fields
      const updateFields: Partial<Note> = {};
      if (title !== undefined) {
        if (typeof title !== "string") {
          res.status(400).json({ error: "Title must be a string" });
          return;
        }
        updateFields.title = title;
      }
      if (content !== undefined) {
        if (typeof content !== "string") {
          res.status(400).json({ error: "Content must be a string" });
          return;
        }
        updateFields.content = content;
      }
      if (isPinned !== undefined) {
        if (typeof isPinned !== "boolean") {
          res.status(400).json({ error: "isPinned must be a boolean" });
          return;
        }
        updateFields.isPinned = isPinned;
      }
      if (isShared !== undefined) {
        if (typeof isShared !== "boolean") {
          res.status(400).json({ error: "isShared must be a boolean" });
          return;
        }
        updateFields.isShared = isShared;
      }
      
      // Handle mentions update
      let validMentions: string[] | undefined;
      if (mentions !== undefined) {
        if (!Array.isArray(mentions)) {
          res.status(400).json({ error: "mentions must be an array" });
          return;
        }
        // Validate mentions are connected users
        validMentions = mentions.filter((mentionId: string) => 
          connectionIds.includes(mentionId)
        );
        updateFields.mentions = validMentions;
      }

      const existingNote = notes[noteIndex];
      const now = new Date().toISOString();
      const updatedNote: Note = {
        ...existingNote,
        ...updateFields,
        authorId: existingNote.authorId || userId,
        authorName: existingNote.authorName || username,
        updatedAt: now,
      };

      notes[noteIndex] = updatedNote;
      await updateUserData(userId, { notes });

      // Sync with sharedNotes collection
      const wasShared = existingNote.isShared || false;
      const nowShared = updatedNote.isShared || false;

      if (nowShared && !wasShared) {
        // Note became shared - add to collection
        await setSharedNote(updatedNote.id, updatedNote);
      } else if (!nowShared && wasShared) {
        // Note became private - remove from collection
        await deleteSharedNote(updatedNote.id);
      } else if (nowShared) {
        // Note was and still is shared - update in collection
        await setSharedNote(updatedNote.id, updatedNote);
      }

      // Send notification messages to NEW mentions only
      if (validMentions) {
        const existingMentions = new Set(existingNote.mentions || []);
        const newMentions = validMentions.filter(id => !existingMentions.has(id));
        
        for (const mentionedUserId of newMentions) {
          const mentionedUserData = await getUserData(mentionedUserId);
          if (mentionedUserData) {
            const notificationMessage: Message = {
              id: randomUUID(),
              fromUserId: userId,
              fromUsername: username,
              toUserId: mentionedUserId,
              toUsername: mentionedUserData.username,
              content: `${username} mentioned you in a note: "${updatedNote.title}"`,
              createdAt: now,
              isRead: false,
              linkedNoteId: updatedNote.id,
            };
            
            // Handle messages as either array or object
            let recipientMsgs: Message[] = [];
            if (Array.isArray(mentionedUserData.messages)) {
              recipientMsgs = mentionedUserData.messages;
            } else if (mentionedUserData.messages && typeof mentionedUserData.messages === 'object') {
              recipientMsgs = Object.values(mentionedUserData.messages);
            }
            recipientMsgs.push(notificationMessage);
            await updateUserData(mentionedUserId, { messages: recipientMsgs });
          }
        }
      }

      res.json(updatedNote);
    } catch (error) {
      console.error("Update note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a note
  app.delete("/api/notes/:noteId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { noteId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle notes as either array or object
      let notes: Note[] = [];
      if (Array.isArray(userData.notes)) {
        notes = userData.notes;
      } else if (userData.notes && typeof userData.notes === 'object') {
        notes = Object.values(userData.notes);
      }
      
      const noteIndex = notes.findIndex((n: Note) => n.id === noteId);

      if (noteIndex === -1) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      const deletedNote = notes[noteIndex];
      notes.splice(noteIndex, 1);
      await updateUserData(userId, { notes });

      // Also remove from sharedNotes if it was shared
      if (deletedNote.isShared) {
        await deleteSharedNote(deletedNote.id);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete note error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== MESSAGING ENDPOINTS =====

  // Get all messages for the user
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle messages as either array or object (Firebase may convert arrays to objects)
      let messages: Message[] = [];
      if (Array.isArray(userData.messages)) {
        messages = userData.messages;
      } else if (userData.messages && typeof userData.messages === 'object') {
        messages = Object.values(userData.messages);
      }
      
      // Filter out any invalid messages and ensure they have required fields
      const validMessages = messages.filter((m: any) => m && m.id && m.createdAt);
      
      // Sort by createdAt descending (newest first)
      const sortedMessages = [...validMessages].sort((a: Message, b: Message) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      res.json(sortedMessages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Internal server error", details: String(error) });
    }
  });

  // Get unread message count
  app.get("/api/messages/unread-count", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle messages as either array or object
      let messages: Message[] = [];
      if (Array.isArray(userData.messages)) {
        messages = userData.messages;
      } else if (userData.messages && typeof userData.messages === 'object') {
        messages = Object.values(userData.messages);
      }
      
      const unreadCount = messages.filter((m: Message) => !m.isRead).length;

      res.json({ count: unreadCount });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send a message to a connected user
  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized - please sign in again" });
        return;
      }

      const validatedData = insertMessageSchema.safeParse(req.body);
      if (!validatedData.success) {
        res.status(400).json({ error: "Invalid message data", details: validatedData.error.errors });
        return;
      }

      const { toUserId, toUsername, content, linkedNoteId } = validatedData.data;

      let userData;
      try {
        userData = await getOrCreateUser(userId, username);
      } catch (firebaseError: any) {
        console.error("Firebase error getting sender data:", firebaseError?.message || firebaseError);
        res.status(500).json({ error: "Database error" });
        return;
      }

      // Handle connections as either array or object (Firebase may convert arrays to objects)
      let connections: string[] = [];
      if (Array.isArray(userData.connections)) {
        connections = userData.connections;
      } else if (userData.connections && typeof userData.connections === 'object') {
        connections = Object.values(userData.connections);
      }

      // Check if recipient is a connected user
      if (!connections.includes(toUserId)) {
        res.status(400).json({ error: "You can only message connected users" });
        return;
      }

      const now = new Date().toISOString();
      const messageId = randomUUID();
      
      // Message for recipient (unread)
      // Note: Firebase doesn't allow undefined values, so only include linkedNoteId if defined
      const recipientMessage: Message = {
        id: messageId,
        fromUserId: userId,
        fromUsername: username,
        toUserId,
        toUsername,
        content,
        createdAt: now,
        isRead: false,
        ...(linkedNoteId ? { linkedNoteId } : {}),
      };

      // Message copy for sender (marked as read, shown as sent)
      const senderMessage: Message = {
        id: `${messageId}-sent`,
        fromUserId: userId,
        fromUsername: username,
        toUserId,
        toUsername,
        content,
        createdAt: now,
        isRead: true,
        ...(linkedNoteId ? { linkedNoteId } : {}),
      };

      // Add message to recipient's inbox
      const recipientData = await getOrCreateUser(toUserId, toUsername);

      // Handle messages as either array or object
      let recipientMsgs: Message[] = [];
      if (Array.isArray(recipientData.messages)) {
        recipientMsgs = [...recipientData.messages];
      } else if (recipientData.messages && typeof recipientData.messages === 'object') {
        recipientMsgs = [...(Object.values(recipientData.messages) as Message[])];
      }
      recipientMsgs.push(recipientMessage);
      await updateUserData(toUserId, { messages: recipientMsgs });

      // Add sent copy to sender's messages
      let senderMsgs: Message[] = [];
      if (Array.isArray(userData.messages)) {
        senderMsgs = [...userData.messages];
      } else if (userData.messages && typeof userData.messages === 'object') {
        senderMsgs = [...(Object.values(userData.messages) as Message[])];
      }
      senderMsgs.push(senderMessage);
      await updateUserData(userId, { messages: senderMsgs });

      res.status(201).json(senderMessage);
    } catch (error: any) {
      console.error("Send message error:", error?.message || error, error?.stack);
      res.status(500).json({ error: "Internal server error", debug: error?.message || String(error) });
    }
  });

  // Mark a message as read
  app.patch("/api/messages/:messageId/read", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle messages as either array or object
      let messages: Message[] = [];
      if (Array.isArray(userData.messages)) {
        messages = userData.messages;
      } else if (userData.messages && typeof userData.messages === 'object') {
        messages = Object.values(userData.messages);
      }
      
      const messageIndex = messages.findIndex((m: Message) => m.id === messageId);

      if (messageIndex === -1) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      messages[messageIndex].isRead = true;
      await updateUserData(userId, { messages });

      res.json(messages[messageIndex]);
    } catch (error) {
      console.error("Mark message read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark all messages as read
  app.post("/api/messages/mark-all-read", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);
      
      // Handle messages as either array or object
      let rawMessages: Message[] = [];
      if (Array.isArray(userData.messages)) {
        rawMessages = userData.messages;
      } else if (userData.messages && typeof userData.messages === 'object') {
        rawMessages = Object.values(userData.messages);
      }
      
      const messages = rawMessages.map((m: Message) => ({
        ...m,
        isRead: true,
      }));

      await updateUserData(userId, { messages });

      res.json({ success: true });
    } catch (error) {
      console.error("Mark all read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a message
  app.delete("/api/messages/:messageId", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";
      const { messageId } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);

      // Handle messages as either array or object
      let rawMessages: Message[] = [];
      if (Array.isArray(userData.messages)) {
        rawMessages = userData.messages;
      } else if (userData.messages && typeof userData.messages === 'object') {
        rawMessages = Object.values(userData.messages);
      }

      const messages = rawMessages.filter((m: Message) => m.id !== messageId);

      await updateUserData(userId, { messages });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete message error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== CHORES ENDPOINTS =====

  // Get all chores for the user
  app.get("/api/chores", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);

      // Handle chores as either array or object
      let chores: any[] = [];
      if (Array.isArray((userData as any).chores)) {
        chores = (userData as any).chores;
      } else if ((userData as any).chores && typeof (userData as any).chores === 'object') {
        chores = Object.values((userData as any).chores);
      }

      // Filter out any invalid chores
      chores = chores.filter((c: any) => c && c.id);

      res.json(chores);
    } catch (error) {
      console.error("Get chores error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save chores
  app.post("/api/chores", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { chores } = req.body;
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { chores });
      res.json({ success: true });
    } catch (error) {
      console.error("Save chores error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== RECIPES ENDPOINTS =====

  // Get all recipes for the user
  app.get("/api/recipes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userData = await getOrCreateUser(userId, username);

      // Handle recipes as either array or object
      let recipes: any[] = [];
      if (Array.isArray((userData as any).recipes)) {
        recipes = (userData as any).recipes;
      } else if ((userData as any).recipes && typeof (userData as any).recipes === 'object') {
        recipes = Object.values((userData as any).recipes);
      }

      // Filter out any invalid recipes
      recipes = recipes.filter((r: any) => r && r.id);

      res.json(recipes);
    } catch (error) {
      console.error("Get recipes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save recipes
  app.post("/api/recipes", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-clerk-user-id"] as string;
      const username = req.headers["x-clerk-username"] as string || "user";

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { recipes } = req.body;
      await getOrCreateUser(userId, username);
      await updateUserData(userId, { recipes });
      res.json({ success: true });
    } catch (error) {
      console.error("Save recipes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
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
      const response = await fetch(oembedUrl);

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
          const response = await fetch(oembedUrl);

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
    const { name, description, iconHint, colorTheme, videoIds } = req.body;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!name || !videoIds || !Array.isArray(videoIds)) {
      res.status(400).json({ error: "name and videoIds are required" });
      return;
    }

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
    const updates = req.body;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

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
