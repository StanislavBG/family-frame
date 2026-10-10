import { createHash } from "crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MEDIA_LIMITS, MediaError, mediaStore, sniffMediaType, type MediaMeta, type MediaStore } from "./media-store";

// Rehosts an https image/PDF referenced only by URL (e.g. an expiring school-photo CDN link
// in an agent-published email) into the private media store. The id is derived from the URL,
// so a repeat import finds the existing media and costs no fetch.
// Note: there is a small DNS-rebinding window between lookup and fetch; accepted, since only
// the owner's token can trigger imports.

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 20_000;

export function rehostIdForUrl(url: string): string {
  return "u" + createHash("sha256").update(url).digest("hex").slice(0, 31);
}

export interface MediaImportDeps {
  fetch: typeof fetch;
  lookup(host: string, opts: { all: true }): Promise<{ address: string; family: number }[]>;
  store: MediaStore;
}

export interface ImportFromUrlInput {
  url: string;
  id?: string;
  filename?: string;
  tags?: string[];
  emailIds?: string[];
}

export interface ImportFromUrlResult {
  meta: MediaMeta;
  created: boolean;
  fetched: boolean;
}

export function isSafeImportUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  if (!host || host.startsWith("[") || isIP(host) !== 0) return false;
  return true;
}

function isPublicIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function parseIPv6(addr: string): number[] | null {
  let s = addr.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // Trailing dotted IPv4 -> two hex groups.
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = dotted[2].split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = dotted[1] + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

export function isPublicAddress(addr: string, family: 4 | 6): boolean {
  if (family === 4) {
    const parts = addr.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return isPublicIPv4(parts);
  }
  const g = parseIPv6(addr);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPublicIPv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
  }
  return true;
}

function filenameFromUrl(raw: string): string {
  try {
    const segs = new URL(raw).pathname.split("/").filter(Boolean);
    let last = segs[segs.length - 1] ?? "";
    try {
      last = decodeURIComponent(last);
    } catch {
      // keep the raw segment
    }
    // eslint-disable-next-line no-control-regex
    const clean = last.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "").trim();
    return clean.slice(0, MEDIA_LIMITS.filenameMax) || "image";
  } catch {
    return "image";
  }
}

export function createMediaImporter(deps: MediaImportDeps) {
  async function assertPublicHost(raw: string): Promise<void> {
    if (!isSafeImportUrl(raw)) throw new MediaError("URL not allowed", 400);
    const host = new URL(raw).hostname.toLowerCase();
    let addrs: { address: string; family: number }[];
    try {
      addrs = await deps.lookup(host, { all: true });
    } catch {
      throw new MediaError("Could not resolve host", 502);
    }
    if (!addrs.length) throw new MediaError("Could not resolve host", 502);
    for (const a of addrs) {
      if ((a.family !== 4 && a.family !== 6) || !isPublicAddress(a.address, a.family)) {
        throw new MediaError("URL not allowed", 400);
      }
    }
  }

  async function download(startUrl: string): Promise<Buffer> {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(current);
      let res: Response;
      try {
        res = await deps.fetch(current, { redirect: "manual", signal });
      } catch {
        // Log only the host: full URLs may carry tokens in the query string.
        console.error(`media import: fetch failed for ${new URL(current).hostname}`);
        throw new MediaError("Fetch failed", 502);
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        if (!location) throw new MediaError("Redirect without Location", 502);
        if (hop === MAX_REDIRECTS) throw new MediaError("Too many redirects", 502);
        try {
          current = new URL(location, current).toString();
        } catch {
          throw new MediaError("Invalid redirect", 502);
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        throw new MediaError(`Upstream status ${res.status}`, 502);
      }
      return readCapped(res);
    }
    throw new MediaError("Too many redirects", 502);
  }

  async function readCapped(res: Response): Promise<Buffer> {
    const tooBig = () => new MediaError(`File exceeds ${MEDIA_LIMITS.fileBytesMax} bytes`, 413);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MEDIA_LIMITS.fileBytesMax) {
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
      throw tooBig();
    }
    if (!res.body) throw new MediaError("Empty response", 502);
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MEDIA_LIMITS.fileBytesMax) {
          await reader.cancel().catch(() => undefined);
          throw tooBig();
        }
        chunks.push(Buffer.from(value));
      }
    } catch (err) {
      if (err instanceof MediaError) throw err;
      throw new MediaError("Fetch failed", 502);
    }
    return Buffer.concat(chunks);
  }

  async function importFromUrl(userId: string, input: ImportFromUrlInput): Promise<ImportFromUrlResult> {
    if (typeof input.url !== "string" || !isSafeImportUrl(input.url)) {
      throw new MediaError("URL not allowed", 400);
    }
    const id = input.id ?? rehostIdForUrl(input.url);
    const existing = await deps.store.getMedia(userId, id);
    if (existing) return { meta: existing.meta, created: false, fetched: false };

    const buffer = await download(input.url);
    const mimeType = sniffMediaType(buffer);
    if (!mimeType) throw new MediaError("Unsupported file type", 415);

    const { meta, created } = await deps.store.putMedia(userId, {
      id,
      filename: input.filename ?? filenameFromUrl(input.url),
      mimeType,
      buffer,
      tags: input.tags,
      emailIds: input.emailIds,
    });
    return { meta, created, fetched: true };
  }

  return { importFromUrl };
}

export type MediaImporter = ReturnType<typeof createMediaImporter>;

export const mediaImporter: MediaImporter = createMediaImporter({
  fetch: (...args) => fetch(...args),
  lookup: (host, opts) => dnsLookup(host, opts),
  store: mediaStore,
});
