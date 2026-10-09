import { getFirebaseDb } from "./firebase";
import { isAllowedGooglePhotoUrl } from "./url-guards";

// Firebase RTDB caps a single write at 10 MB; base64 inflates by 4/3, so 7 MB raw -> ~9.3 MB.
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

export interface PhotoCacheDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  remove(path: string): Promise<void>;
  fetch: typeof fetch;
}

export interface CachablePhoto {
  id: string;
  baseUrl: string;
  mimeType?: string;
}

export function photoCacheKey(photoId: string): string {
  return encodeURIComponent(photoId).replace(/\./g, "%2E");
}

export function createPhotoCache(deps: PhotoCacheDeps) {
  const inFlight = new Map<string, Promise<string[]>>();

  async function cachePhoto(userId: string, photo: CachablePhoto, accessToken: string): Promise<boolean> {
    if (!isAllowedGooglePhotoUrl(photo.baseUrl)) {
      console.warn(`[photo-cache] ${photo.id}: baseUrl host not allowed`);
      return false;
    }
    try {
      const res = await deps.fetch(`${photo.baseUrl}=w1920-h1080`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[photo-cache] ${photo.id}: upstream status ${res.status}`);
        return false;
      }
      const mimeType = res.headers.get("content-type") || "";
      if (!mimeType.startsWith("image/")) {
        console.warn(`[photo-cache] ${photo.id}: non-image content-type "${mimeType}"`);
        return false;
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_BYTES) {
        console.warn(`[photo-cache] ${photo.id}: too large (${declared} bytes)`);
        return false;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_BYTES) {
        console.warn(`[photo-cache] ${photo.id}: too large (${buffer.length} bytes)`);
        return false;
      }
      await deps.set(`photoCache/${userId}/${photoCacheKey(photo.id)}`, {
        data: buffer.toString("base64"),
        mimeType,
        size: buffer.length,
        cachedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.warn(`[photo-cache] ${photo.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  function cachePhotos(
    userId: string,
    photos: CachablePhoto[],
    accessToken: string,
    concurrency = 4,
  ): Promise<string[]> {
    const existing = inFlight.get(userId);
    if (existing) return existing;

    const run = (async () => {
      const succeeded: string[] = [];
      let next = 0;
      const worker = async () => {
        while (next < photos.length) {
          const photo = photos[next++];
          if (await cachePhoto(userId, photo, accessToken)) succeeded.push(photo.id);
        }
      };
      const workers = Array.from({ length: Math.max(1, Math.min(concurrency, photos.length)) }, worker);
      await Promise.all(workers);
      return succeeded;
    })().finally(() => {
      inFlight.delete(userId);
    });

    inFlight.set(userId, run);
    return run;
  }

  async function getCachedPhoto(
    userId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const entry = await deps.get(`photoCache/${userId}/${photoCacheKey(photoId)}`);
    if (!entry || typeof entry.data !== "string") return null;
    return { buffer: Buffer.from(entry.data, "base64"), mimeType: entry.mimeType };
  }

  async function removeCachedPhoto(userId: string, photoId: string): Promise<void> {
    await deps.remove(`photoCache/${userId}/${photoCacheKey(photoId)}`);
  }

  async function removeAllCachedPhotos(userId: string): Promise<void> {
    await deps.remove(`photoCache/${userId}`);
  }

  return { cachePhoto, cachePhotos, getCachedPhoto, removeCachedPhoto, removeAllCachedPhotos };
}

export type PhotoCache = ReturnType<typeof createPhotoCache>;

let instance: PhotoCache | null = null;

function defaultCache(): PhotoCache {
  if (!instance) {
    instance = createPhotoCache({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
      fetch: (input, init) => fetch(input, init),
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const photoCache: PhotoCache = {
  cachePhoto: (...args) => defaultCache().cachePhoto(...args),
  cachePhotos: (...args) => defaultCache().cachePhotos(...args),
  getCachedPhoto: (...args) => defaultCache().getCachedPhoto(...args),
  removeCachedPhoto: (...args) => defaultCache().removeCachedPhoto(...args),
  removeAllCachedPhotos: (...args) => defaultCache().removeAllCachedPhotos(...args),
};
