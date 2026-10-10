import { createHash } from "node:crypto";
import type { HouseholdAddress } from "../../shared/household";
import { getGeocode, putGeocode, type EventsDb } from "./db";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Geocoder {
  geocode(query: string): Promise<LatLon | null>;
}

export interface GeocoderOptions {
  db: EventsDb;
  fetch?: typeof fetch;
  userAgent: string;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PROVIDER = "nominatim";
const TIMEOUT_MS = 10_000;

function normalizeQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Geocoder backed by OpenStreetMap Nominatim: cached, one request at a time, spaced by minIntervalMs. */
export function createGeocoder(opts: GeocoderOptions): Geocoder {
  const { db, userAgent, minIntervalMs = 1100 } = opts;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastCallAt: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function lookup(query: string): Promise<LatLon | null> {
    const normalized = normalizeQuery(query);
    if (!normalized) return null;
    const queryHash = createHash("sha256").update(normalized).digest("hex");
    const cached = getGeocode(db, queryHash);
    if (cached) return { lat: cached.lat, lon: cached.lon };

    if (lastCallAt !== null) {
      const wait = lastCallAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
    }
    lastCallAt = now();
    try {
      const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
      const res = await doFetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (!Array.isArray(body) || body.length === 0) return null;
      const first = body[0] as { lat?: unknown; lon?: unknown };
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      putGeocode(db, { queryHash, query: normalized, lat, lon, provider: PROVIDER, createdAt: new Date(now()).toISOString() });
      return { lat, lon };
    } catch {
      return null;
    }
  }

  return {
    geocode(query: string): Promise<LatLon | null> {
      const run = queue.then(() => lookup(query));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export type GeocodeLevel = "full" | "postal" | "city";

export interface HouseholdGeocode extends LatLon {
  level: GeocodeLevel;
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(", ");
}

/** Try the full address, then postalCode+city+country, then city+country. Returns the first hit and its level. */
export async function geocodeHousehold(
  geocoder: Pick<Geocoder, "geocode">,
  address: HouseholdAddress,
): Promise<HouseholdGeocode | null> {
  const attempts: Array<[GeocodeLevel, string]> = [
    ["full", joinParts([address.line1, address.line2, address.city, address.region, address.postalCode, address.country])],
    ["postal", address.postalCode?.trim() ? joinParts([address.postalCode, address.city, address.country]) : ""],
    ["city", joinParts([address.city, address.country])],
  ];
  for (const [level, query] of attempts) {
    if (!query) continue;
    const hit = await geocoder.geocode(query);
    if (hit) return { ...hit, level };
  }
  return null;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function norm(s: string | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Groups households for shared searches: lowercase, accent-stripped 'city|region|country'. */
export function areaKey(address: Pick<HouseholdAddress, "city" | "region" | "country">): string {
  return `${norm(address.city)}|${norm(address.region)}|${norm(address.country)}`;
}
