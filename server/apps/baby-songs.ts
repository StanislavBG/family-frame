import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { updateUserData } from "../firebase";
import { asyncHandler, getOrCreateUser, toArray } from "../middleware";
import { FETCH_TIMEOUT_MS } from "../route-helpers";
import { createPlaylistSchema, updatePlaylistSchema } from "@shared/schema";

export function registerBabySongsRoutes(app: Express): void {
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
}
