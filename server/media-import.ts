import { createHash } from "crypto";
import { lookup as dnsLookup } from "node:dns/promises";
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
  personIds?: string[];
}

export interface ImportFromUrlResult {
  meta: MediaMeta;
  created: boolean;
  fetched: boolean;
}

import { isPublicAddress, isSafeFetchUrl } from "./url-guards";

export { isPublicAddress };
export const isSafeImportUrl = isSafeFetchUrl;

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
    if (!isSafeFetchUrl(raw)) throw new MediaError("URL not allowed", 400);
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
    if (existing) {
      // A repeat import adds its email/person links to the stored file instead of dropping them.
      const linked = await deps.store.linkMedia(userId, id, { emailIds: input.emailIds, personIds: input.personIds });
      return { meta: linked ?? existing.meta, created: false, fetched: false };
    }

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
      personIds: input.personIds,
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
