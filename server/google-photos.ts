import type { GooglePhotoItem } from "@shared/schema";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// New Photos Picker API scope (replaces deprecated photoslibrary.readonly)
const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const scopes = [PICKER_SCOPE];

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  if (state) {
    params.set("state", state);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID || "",
        client_secret: GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Google] Token exchange error:", error);
      return null;
    }

    const data = await response.json();
    console.log("[Google] Token exchange successful");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  } catch (error) {
    console.error("[Google] Token exchange error:", error);
    return null;
  }
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number } | null> {
  console.log("[Google Refresh] Attempting token refresh...");
  
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID || "",
        client_secret: GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });

    console.log("[Google Refresh] Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google Refresh] Token refresh FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("[Google Refresh] Token refresh SUCCESS, expires_in:", data.expires_in, "seconds");

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  } catch (error) {
    console.error("[Google Refresh] Token refresh exception:", error);
    return null;
  }
}

// ============================================
// Google Photos Picker API Functions
// ============================================

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollingConfig?: {
    pollInterval: string;
    timeoutIn: string;
  };
  mediaItemsSet?: boolean;
}

export interface PickedMediaItem {
  id: string;
  createTime: string;
  type: string;
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
  };
}

// Create a new Picker session - returns a pickerUri for the user to select photos
export async function createPickerSession(accessToken: string): Promise<PickerSession | null> {
  console.log("[Picker] Creating new picker session...");
  
  try {
    const response = await fetch("https://photospicker.googleapis.com/v1/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    console.log("[Picker] Create session response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Picker] Create session FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("[Picker] Session created:", JSON.stringify(data).substring(0, 500));

    return {
      id: data.id,
      pickerUri: data.pickerUri,
      pollingConfig: data.pollingConfig,
      mediaItemsSet: data.mediaItemsSet || false,
    };
  } catch (error) {
    console.error("[Picker] Create session exception:", error);
    return null;
  }
}

// Poll a Picker session to check if user has finished selecting
export async function getPickerSession(accessToken: string, sessionId: string): Promise<PickerSession | null> {
  console.log("[Picker] Getting session status for:", sessionId);
  
  try {
    const response = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log("[Picker] Get session response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Picker] Get session FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("[Picker] Session status:", data.mediaItemsSet ? "COMPLETE" : "PENDING");

    return {
      id: data.id,
      pickerUri: data.pickerUri,
      pollingConfig: data.pollingConfig,
      mediaItemsSet: data.mediaItemsSet || false,
    };
  } catch (error) {
    console.error("[Picker] Get session exception:", error);
    return null;
  }
}

// Get the media items that were selected in the picker session
export async function getPickedMediaItems(accessToken: string, sessionId: string): Promise<GooglePhotoItem[]> {
  console.log("[Picker] Fetching selected media items for session:", sessionId);
  
  const photos: GooglePhotoItem[] = [];
  let pageToken: string | undefined;
  
  try {
    do {
      const url = new URL(`https://photospicker.googleapis.com/v1/mediaItems`);
      url.searchParams.set("sessionId", sessionId);
      url.searchParams.set("pageSize", "100");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log("[Picker] Get media items response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Picker] Get media items FAILED:", response.status, errorText);
        break;
      }

      const data = await response.json();
      console.log("[Picker] Got", data.mediaItems?.length || 0, "media items");

      if (data.mediaItems) {
        const now = Date.now();
        for (const item of data.mediaItems) {
          if (item.type === "PHOTO" || item.mediaFile?.mimeType?.startsWith("image/")) {
            photos.push({
              id: item.id,
              baseUrl: item.mediaFile?.baseUrl || "",
              filename: item.mediaFile?.filename || "",
              mimeType: item.mediaFile?.mimeType || "image/jpeg",
              creationTime: item.createTime,
              fetchedAt: now,
            });
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken && photos.length < 500);

    // Shuffle the photos for variety in slideshow
    for (let i = photos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [photos[i], photos[j]] = [photos[j], photos[i]];
    }

    console.log("[Picker] Total photos fetched:", photos.length);
    return photos;
  } catch (error) {
    console.error("[Picker] Get media items exception:", error);
    return [];
  }
}

// Delete/close a picker session
export async function deletePickerSession(accessToken: string, sessionId: string): Promise<boolean> {
  console.log("[Picker] Deleting session:", sessionId);
  
  try {
    const response = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log("[Picker] Delete session response status:", response.status);
    return response.ok;
  } catch (error) {
    console.error("[Picker] Delete session exception:", error);
    return false;
  }
}

// Refresh a photo's baseUrl using the Picker API (URLs expire after 60 minutes)
export async function refreshPickerPhotoUrl(
  accessToken: string,
  mediaItemId: string,
  sessionId: string
): Promise<{ baseUrl: string; fetchedAt: number } | null> {
  console.log("[Picker] Refreshing photo URL for:", mediaItemId);
  
  try {
    // We need to re-fetch from the session's media items
    const url = new URL(`https://photospicker.googleapis.com/v1/mediaItems`);
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("pageSize", "100");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("[Picker] Refresh photo URL FAILED:", await response.text());
      return null;
    }

    const data = await response.json();
    const item = data.mediaItems?.find((i: any) => i.id === mediaItemId);
    
    if (!item) {
      console.error("[Picker] Photo not found in session");
      return null;
    }

    return {
      baseUrl: item.mediaFile?.baseUrl || "",
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error("[Picker] Refresh photo URL exception:", error);
    return null;
  }
}
