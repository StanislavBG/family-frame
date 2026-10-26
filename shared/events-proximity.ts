/**
 * "Close to home" for Events.
 *
 * Rule: an item is close to home when it is NOT online, NOT a trip idea, and
 * either within 5 miles (8.05 km) of home or in the household's own city.
 *
 * Pure module: no I/O, no clock. It compares only city/region/country and a
 * distance; it never sees a street address.
 */

export const CLOSE_TO_HOME_MILES = 5;
export const CLOSE_TO_HOME_KM = 8.05;

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

export function canonicalCountry(country: string): string {
  const c = norm(country);
  return COUNTRY_ALIASES[c] ?? c;
}

/** Drops a trailing ", <region>" / ", <2-3 letter code>" / ", <US state name>" from a normalised city. */
export function canonicalCity(city: string, region: string = ""): string {
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

export interface Place {
  city: string;
  region?: string;
  country: string;
}

/** Same canonical city (non-empty); countries must also match when both are given. */
export function sameCity(a: Place, b: Place): boolean {
  const ca = canonicalCity(a.city ?? "", a.region ?? "");
  const cb = canonicalCity(b.city ?? "", b.region ?? "");
  if (!ca || !cb || ca !== cb) return false;
  const ka = canonicalCountry(a.country ?? "");
  const kb = canonicalCountry(b.country ?? "");
  if (ka && kb && ka !== kb) return false;
  return true;
}

export interface CloseToHomeInput {
  distanceKm?: number;
  online: boolean;
  tripIdea: boolean;
  eventPlace: Place;
  home: Place | null;
}

export function isCloseToHome(input: CloseToHomeInput): boolean {
  if (input.online || input.tripIdea) return false;
  const d = input.distanceKm;
  if (typeof d === "number" && Number.isFinite(d) && d <= CLOSE_TO_HOME_KM) return true;
  return input.home !== null && sameCity(input.eventPlace, input.home);
}
