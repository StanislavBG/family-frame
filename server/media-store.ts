import { createHash } from "crypto";
import { getFirebaseDb } from "./firebase";
import { AGENT_ID_PATTERN } from "@shared/agent-data";

// Private per-user file storage for agent-uploaded images and PDFs. There is no
// Firebase Storage bucket, so the default backend keeps base64 in RTDB like
// photo-cache.ts; swap `MediaDeps` for a bucket-backed one later.
// Media is private to the account: nothing here reads or writes users/<userId>
// and it is never shared with household connections.

export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];
export type MediaKind = "image" | "pdf";

export const MEDIA_LIMITS = {
  // RTDB caps a single write at 10 MB; base64 inflates by 4/3, so 7 MB raw -> ~9.3 MB.
  fileBytesMax: 7 * 1024 * 1024,
  userBytesMax: 500 * 1024 * 1024,
  itemsPerUserMax: 5000,
  filenameMax: 255,
  tagsMax: 20,
  tagMax: 40,
  emailIdsMax: 20,
  listLimitDefault: 100,
  listLimitMax: 500,
} as const;

export class MediaError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MediaError";
  }
}

export interface MediaDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
}

export interface MediaMeta {
  id: string;
  filename: string;
  mimeType: MediaMimeType;
  kind: MediaKind;
  size: number;
  sha256: string;
  tags: string[];
  emailIds: string[];
  createdAt: string;
}

export interface PutMediaInput {
  id?: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  tags?: string[];
  emailIds?: string[];
}

export interface ListMediaOptions {
  kind?: MediaKind;
  tag?: string;
  emailId?: string;
  limit?: number;
  offset?: number;
}

export function sniffMediaType(buf: Buffer): MediaMimeType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 6) {
    const head = buf.toString("latin1", 0, 6);
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

const TAG_PATTERN = /^[a-z0-9-]+$/;

function normalizeMeta(raw: any): MediaMeta {
  return {
    id: raw.id,
    filename: raw.filename,
    mimeType: raw.mimeType,
    kind: raw.kind,
    size: raw.size,
    sha256: raw.sha256,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    emailIds: Array.isArray(raw.emailIds) ? raw.emailIds : [],
    createdAt: raw.createdAt,
  };
}

function cleanFilename(value: unknown): string {
  if (typeof value !== "string") throw new MediaError("filename is required", 400);
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "").trim();
  if (name.length < 1 || name.length > MEDIA_LIMITS.filenameMax) {
    throw new MediaError(`filename must be 1-${MEDIA_LIMITS.filenameMax} characters`, 400);
  }
  return name;
}

function cleanTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MEDIA_LIMITS.tagsMax) {
    throw new MediaError(`tags must be an array of at most ${MEDIA_LIMITS.tagsMax}`, 400);
  }
  return value.map((t) => {
    const tag = typeof t === "string" ? t.toLowerCase() : "";
    if (tag.length < 1 || tag.length > MEDIA_LIMITS.tagMax || !TAG_PATTERN.test(tag)) {
      throw new MediaError(`tags must be 1-${MEDIA_LIMITS.tagMax} characters of a-z, 0-9 and -`, 400);
    }
    return tag;
  });
}

function cleanEmailIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MEDIA_LIMITS.emailIdsMax) {
    throw new MediaError(`emailIds must be an array of at most ${MEDIA_LIMITS.emailIdsMax}`, 400);
  }
  return value.map((e) => {
    if (typeof e !== "string" || !AGENT_ID_PATTERN.test(e)) throw new MediaError("Invalid emailId", 400);
    return e;
  });
}

export function createMediaStore(deps: MediaDeps) {
  const base = (userId: string) => `media/${userId}`;

  // Bounded by itemsPerUserMax (5000 small meta records), so reading the whole node is cheap.
  async function readAllMeta(userId: string): Promise<MediaMeta[]> {
    const raw = await deps.get(`${base(userId)}/meta`);
    if (!raw || typeof raw !== "object") return [];
    return Object.values(raw).map(normalizeMeta);
  }

  async function putMedia(userId: string, input: PutMediaInput): Promise<{ meta: MediaMeta; created: boolean }> {
    if (input.id !== undefined && (typeof input.id !== "string" || !AGENT_ID_PATTERN.test(input.id))) {
      throw new MediaError("Invalid id", 400);
    }
    const filename = cleanFilename(input.filename);
    const tags = cleanTags(input.tags);
    const emailIds = cleanEmailIds(input.emailIds);

    const buffer = input.buffer;
    if (buffer.length > MEDIA_LIMITS.fileBytesMax) {
      throw new MediaError(`File exceeds ${MEDIA_LIMITS.fileBytesMax} bytes`, 413);
    }
    const sniffed = sniffMediaType(buffer);
    if (!sniffed) throw new MediaError("Unsupported file type", 415);
    if (sniffed !== input.mimeType) throw new MediaError("Declared mimeType does not match file content", 415);

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const id = input.id ?? sha256.slice(0, 32);

    const existing = await deps.get(`${base(userId)}/meta/${id}`);
    if (existing) {
      if (existing.sha256 === sha256) return { meta: normalizeMeta(existing), created: false };
      throw new MediaError("A different file already exists with this id", 409);
    }

    const all = await readAllMeta(userId);
    const bytes = all.reduce((sum, m) => sum + (m.size || 0), 0);
    if (all.length + 1 > MEDIA_LIMITS.itemsPerUserMax || bytes + buffer.length > MEDIA_LIMITS.userBytesMax) {
      throw new MediaError("Media storage quota exceeded", 507);
    }

    const meta: MediaMeta = {
      id,
      filename,
      mimeType: sniffed,
      kind: sniffed === "application/pdf" ? "pdf" : "image",
      size: buffer.length,
      sha256,
      tags,
      emailIds,
      createdAt: (deps.now?.() ?? new Date()).toISOString(),
    };
    await deps.update(base(userId), {
      [`meta/${id}`]: meta,
      [`blobs/${id}`]: { data: buffer.toString("base64") },
    });
    return { meta, created: true };
  }

  async function getMedia(userId: string, id: string): Promise<{ meta: MediaMeta; buffer: Buffer } | null> {
    if (!AGENT_ID_PATTERN.test(id)) return null;
    const [rawMeta, blob] = await Promise.all([
      deps.get(`${base(userId)}/meta/${id}`),
      deps.get(`${base(userId)}/blobs/${id}`),
    ]);
    if (!rawMeta || !blob || typeof blob.data !== "string") return null;
    return { meta: normalizeMeta(rawMeta), buffer: Buffer.from(blob.data, "base64") };
  }

  async function listMedia(
    userId: string,
    opts: ListMediaOptions = {},
  ): Promise<{ items: MediaMeta[]; total: number; usage: { bytes: number; count: number } }> {
    const all = await readAllMeta(userId);
    const usage = { bytes: all.reduce((sum, m) => sum + (m.size || 0), 0), count: all.length };
    const tag = opts.tag?.toLowerCase();
    const filtered = all
      .filter((m) => (opts.kind ? m.kind === opts.kind : true))
      .filter((m) => (tag ? m.tags.includes(tag) : true))
      .filter((m) => (opts.emailId ? m.emailIds.includes(opts.emailId) : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
    const limit = Math.min(
      Math.max(1, Math.floor(opts.limit ?? MEDIA_LIMITS.listLimitDefault)),
      MEDIA_LIMITS.listLimitMax,
    );
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, usage };
  }

  async function deleteMedia(userId: string, id: string): Promise<boolean> {
    if (!AGENT_ID_PATTERN.test(id)) return false;
    const existing = await deps.get(`${base(userId)}/meta/${id}`);
    if (!existing) return false;
    await deps.update(base(userId), { [`meta/${id}`]: null, [`blobs/${id}`]: null });
    return true;
  }

  return { putMedia, getMedia, listMedia, deleteMedia };
}

export type MediaStore = ReturnType<typeof createMediaStore>;

let instance: MediaStore | null = null;

function defaultStore(): MediaStore {
  if (!instance) {
    instance = createMediaStore({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async update(path, values) {
        await getFirebaseDb().ref(path).update(values);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const mediaStore: MediaStore = {
  putMedia: (...args) => defaultStore().putMedia(...args),
  getMedia: (...args) => defaultStore().getMedia(...args),
  listMedia: (...args) => defaultStore().listMedia(...args),
  deleteMedia: (...args) => defaultStore().deleteMedia(...args),
};
