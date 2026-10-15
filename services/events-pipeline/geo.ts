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

const US_STATES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "district of columbia", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah",
  "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  us: "us", usa: "us", "u.s.": "us", "u.s.a.": "us", "united states": "us", "united states of america": "us",
  uk: "gb", gb: "gb", "united kingdom": "gb", "great britain": "gb", england: "gb",
  bulgaria: "bg",
};

function canonicalCountry(country: string): string {
  const c = norm(country);
  return COUNTRY_ALIASES[c] ?? c;
}

/** Drops a trailing ", <region>" / ", <2-3 letter code>" / ", <US state name>" from a normalised city. */
function canonicalCity(city: string, region: string): string {
  const n = norm(city);
  const comma = n.lastIndexOf(",");
  if (comma < 0) return n;
  const suffix = n.slice(comma + 1).trim();
  const r = norm(region);
  if ((r && suffix === r) || /^[a-z]{2,3}$/.test(suffix) || US_STATES.has(suffix)) {
    return n.slice(0, comma).trim();
  }
  return n;
}

/** Groups households for shared searches: canonical '<city>|<country>' (region is dropped on purpose). */
export function areaKey(address: Pick<HouseholdAddress, "city" | "region" | "country">): string {
  return `${canonicalCity(address.city ?? "", address.region ?? "")}|${canonicalCountry(address.country ?? "")}`;
}

/** Converts a legacy 'city|region|country' key (or an already canonical 'city|country' key) to the canonical key. */
export function canonicalAreaKeyFromLegacy(oldKey: string): string {
  const parts = oldKey.split("|");
  if (parts.length >= 3) {
    return areaKey({ city: parts[0], region: parts[1], country: parts.slice(2).join("|") });
  }
  if (parts.length === 2) return areaKey({ city: parts[0], region: "", country: parts[1] });
  return areaKey({ city: oldKey, region: "", country: "" });
}
