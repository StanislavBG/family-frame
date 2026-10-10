import express from "express";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./middleware";
import { mediaImporter, type MediaImporter } from "./media-import";
import { mediaStore, MediaError, type MediaStore, type MediaKind } from "./media-store";

type MediaHandler = (req: Request, res: Response, userId: string) => Promise<void>;

// Auth header check + MediaError mapping; unexpected errors fall through to asyncHandler (500).
function mediaHandler(fn: MediaHandler) {
  return asyncHandler(async (req, res) => {
    const userId = req.headers["x-clerk-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      await fn(req, res, userId);
    } catch (error) {
      if (error instanceof MediaError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}

function queryNumber(value: unknown): number | undefined {
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function queryList(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function asciiFilename(name: string, fallback: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, "").trim();
  return cleaned || fallback;
}

const importBodySchema = z.object({
  url: z.string().min(1).max(2048),
  id: z.string().min(1).max(128).optional(),
  filename: z.string().min(1).max(255).optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  emailIds: z.array(z.string().max(128)).max(50).optional(),
}).strict();

export function registerMediaRoutes(
  app: Express,
  store: MediaStore = mediaStore,
  importer: Pick<MediaImporter, "importFromUrl"> = mediaImporter,
): void {
  // Registered before any /api/files/:id route. JSON body, so no raw parser here.
  app.post(
    "/api/files/import",
    express.json({ limit: "64kb" }),
    mediaHandler(async (req, res, userId) => {
      const parsed = importBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body" });
        return;
      }
      const { meta, created } = await importer.importFromUrl(userId, parsed.data);
      res.status(created ? 201 : 200).json({ meta, created });
    }),
  );

  app.post(
    "/api/files",
    express.raw({ type: () => true, limit: "8mb" }),
    mediaHandler(async (req, res, userId) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new MediaError("Empty body", 400);
      }
      const mimeType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const { meta, created } = await store.putMedia(userId, {
        id: queryString(req.query.id),
        filename: req.query.filename as string,
        mimeType,
        buffer: req.body,
        tags: queryList(req.query.tags),
        emailIds: queryList(req.query.emailIds),
      });
      res.status(created ? 201 : 200).json(meta);
    }),
  );

  app.get("/api/files", mediaHandler(async (req, res, userId) => {
    res.json(await store.listMedia(userId, {
      kind: queryString(req.query.kind) as MediaKind | undefined,
      tag: queryString(req.query.tag),
      emailId: queryString(req.query.emailId),
      limit: queryNumber(req.query.limit),
      offset: queryNumber(req.query.offset),
    }));
  }));

  app.get("/api/files/:id/meta", mediaHandler(async (req, res, userId) => {
    const found = await store.getMedia(userId, req.params.id);
    if (!found) throw new MediaError("File not found", 404);
    res.json(found.meta);
  }));

  app.get("/api/files/:id", mediaHandler(async (req, res, userId) => {
    const found = await store.getMedia(userId, req.params.id);
    if (!found) throw new MediaError("File not found", 404);
    const { meta, buffer } = found;
    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", `inline; filename="${asciiFilename(meta.filename, meta.id)}"`);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  }));

  app.delete("/api/files/:id", mediaHandler(async (req, res, userId) => {
    const removed = await store.deleteMedia(userId, req.params.id);
    if (!removed) throw new MediaError("File not found", 404);
    res.status(204).end();
  }));
}
