import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createOAuthState, verifyOAuthState } from "../oauth-state";
import { getUserData, setUserData, updateUserData } from "../firebase";
import { asyncHandler, getOrCreateUser, toArray, type UserData } from "../middleware";
import { getGoogleAuthUrl, exchangeCodeForTokens, refreshAccessToken, createPickerSession, getPickerSession, getPickedMediaItems, deletePickerSession, refreshPickerPhotoUrl } from "../google-photos";
import { isAllowedGooglePhotoUrl } from "../url-guards";
import { getAppBaseUrl } from "../config";
import { photoCache } from "../photo-cache";
import { FETCH_TIMEOUT_MS } from "../route-helpers";
import type { GooglePhotoItem, StoredPhoto } from "@shared/schema";
import { PhotoSource } from "@shared/schema";

const OAUTH_NONCE_COOKIE = "ff_oauth_nonce";
const OAUTH_NONCE_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_NOT_CONFIGURED = { error: "Google Photos sign-in not configured" };


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

const PIXABAY_CACHE_TTL_MS = 10 * 60 * 1000;
const PIXABAY_MAX_PER_PAGE = 50;

export function registerPhotosRoutes(app: Express): void {
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
}
