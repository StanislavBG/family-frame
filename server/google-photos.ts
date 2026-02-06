import type { GooglePhotoItem } from "@shared/schema";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Helper function for retrying fetch requests with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry client errors (4xx) except for 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Retry on server errors (5xx) or rate limiting (429)
      if (response.status >= 500 || response.status === 429) {
        if (attempt < maxRetries) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(`[${context}] Got ${response.status}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`[${context}] Network error, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error(`[${context}] All ${maxRetries} retries failed`);
}

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
    const response = await fetchWithRetry(
      "https://oauth2.googleapis.com/token",
      {
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
      },
      "Google Token Exchange"
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[Google] Token exchange error:", error);
      return null;
    }

    const data = await response.json();

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
  try {
    const response = await fetchWithRetry(
      "https://oauth2.googleapis.com/token",
      {
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
      },
      "Google Refresh"
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google Refresh] Token refresh FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();

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
  try {
    const response = await fetchWithRetry(
      "https://photospicker.googleapis.com/v1/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      "Picker Create Session"
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Picker] Create session FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();

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
  try {
    const response = await fetchWithRetry(
      `https://photospicker.googleapis.com/v1/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      "Picker Get Session"
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Picker] Get session FAILED:", response.status, errorText);
      return null;
    }

    const data = await response.json();

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

      const response = await fetchWithRetry(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        "Picker Get Media Items"
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Picker] Get media items FAILED:", response.status, errorText);
        break;
      }

      const data = await response.json();

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

    return photos;
  } catch (error) {
    console.error("[Picker] Get media items exception:", error);
    return photos; // Return partial results instead of empty array
  }
}

// Delete/close a picker session
export async function deletePickerSession(accessToken: string, sessionId: string): Promise<boolean> {
  try {
    const response = await fetchWithRetry(
      `https://photospicker.googleapis.com/v1/sessions/${sessionId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      "Picker Delete Session"
    );

    return response.ok;
  } catch (error) {
    console.error("[Picker] Delete session exception:", error);
    return false;
  }
}

// Refresh a photo's baseUrl using the Picker API (URLs expire after 60 minutes)
// Now with pagination support to find photos beyond the first 100
export async function refreshPickerPhotoUrl(
  accessToken: string,
  mediaItemId: string,
  sessionId: string
): Promise<{ baseUrl: string; fetchedAt: number } | null> {
  let pageToken: string | undefined;
  let pagesSearched = 0;
  const maxPages = 10; // Limit to 1000 photos max

  try {
    do {
      const url = new URL(`https://photospicker.googleapis.com/v1/mediaItems`);
      url.searchParams.set("sessionId", sessionId);
      url.searchParams.set("pageSize", "100");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetchWithRetry(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        "Picker Refresh Photo URL"
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Picker] Refresh photo URL FAILED:", response.status, errorText);
        return null;
      }

      const data = await response.json();
      const item = data.mediaItems?.find((i: any) => i.id === mediaItemId);

      if (item) {
        console.log("[Picker] Found photo on page", pagesSearched + 1);
        return {
          baseUrl: item.mediaFile?.baseUrl || "",
          fetchedAt: Date.now(),
        };
      }

      pageToken = data.nextPageToken;
      pagesSearched++;
    } while (pageToken && pagesSearched < maxPages);

    console.error("[Picker] Photo not found in session after", pagesSearched, "pages");
    return null;
  } catch (error) {
    console.error("[Picker] Refresh photo URL exception:", error);
    return null;
  }
}
