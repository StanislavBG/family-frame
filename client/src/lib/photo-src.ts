import type { GooglePhotoItem } from "@shared/schema";

// Helper to create proxied URL for Google Photos
export function getProxiedPhotoUrl(baseUrl: string): string {
  const fullUrl = `${baseUrl}=w1920-h1080`;
  return `/api/photos/proxy?url=${encodeURIComponent(fullUrl)}`;
}

// Cached photos are served from our own origin and never expire
export function getPhotoSrc(photo: Pick<GooglePhotoItem, "baseUrl" | "cached">): string {
  return photo.cached ? photo.baseUrl : getProxiedPhotoUrl(photo.baseUrl);
}
