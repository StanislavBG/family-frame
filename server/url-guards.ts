// Only Google Photos base URLs are proxied (client/src/pages/photos.tsx and
// screensaver.tsx build them from Google Photos Picker baseUrls, served from
// *.googleusercontent.com). Pixabay images are loaded directly by the client
// and never go through /api/photos/proxy.
const GOOGLE_PHOTO_DOMAIN = "googleusercontent.com";

export function isAllowedGooglePhotoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === GOOGLE_PHOTO_DOMAIN || host.endsWith(`.${GOOGLE_PHOTO_DOMAIN}`);
}
