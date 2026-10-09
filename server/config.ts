const DEFAULT_APP_BASE_URL = "https://family-frame.replit.app";

export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_BASE_URL;
}
