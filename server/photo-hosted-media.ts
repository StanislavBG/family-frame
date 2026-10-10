import type { GooglePhotoItem, Person } from "@shared/schema";
import { mediaStore, MEDIA_LIMITS, type MediaMeta, type MediaStore } from "./media-store";

export const PHOTO_STREAM_MAX = 2000;

export function mediaToPhotoItems(items: MediaMeta[]): GooglePhotoItem[] {
  const fetchedAt = Date.now();
  return items
    .filter((m) => m.kind === "image" && !m.tags.includes("hidden"))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((m) => ({
      id: m.id,
      baseUrl: `/api/files/${encodeURIComponent(m.id)}`,
      filename: m.filename,
      mimeType: m.mimeType,
      creationTime: m.createdAt,
      fetchedAt,
      cached: true,
    }));
}

/**
 * Person refs to match against media `personIds`, or null for the whole household.
 * Media personIds are free strings (REST stores them as sent), so each chosen person
 * contributes both their id and their name.
 */
export function resolveStreamPersonRefs(
  people: Person[],
  scope: "household" | "people" | undefined,
  personIds: string[] | undefined,
): string[] | null {
  if (scope !== "people") return null;
  const refs = new Set<string>();
  for (const id of personIds ?? []) {
    const person = people.find((p) => p.id === id);
    if (!person) continue;
    refs.add(person.id);
    refs.add(person.name);
  }
  return Array.from(refs);
}

const MAX_PAGES = Math.ceil(MEDIA_LIMITS.itemsPerUserMax / MEDIA_LIMITS.listLimitMax);

export function createHostedPhotoSource(store: Pick<MediaStore, "listMedia">) {
  return {
    async listPhotos(userId: string, personRefs: string[] | null): Promise<GooglePhotoItem[]> {
      if (personRefs && personRefs.length === 0) return [];
      const collected: MediaMeta[] = [];
      for (let page = 0; page < MAX_PAGES && collected.length < PHOTO_STREAM_MAX; page++) {
        const { items, total } = await store.listMedia(userId, {
          kind: "image",
          ...(personRefs ? { personIds: personRefs } : {}),
          limit: MEDIA_LIMITS.listLimitMax,
          offset: collected.length,
        });
        collected.push(...items);
        if (items.length === 0 || collected.length >= total) break;
      }
      return mediaToPhotoItems(collected).slice(0, PHOTO_STREAM_MAX);
    },
  };
}

export const hostedPhotoSource = createHostedPhotoSource(mediaStore);
