/**
 * Source classification for Events: is a URL the organizer's own page
 * (official), a registration-platform tenant page (registration) or a
 * listing/aggregator page (listing, the default). Pure module, runs in the
 * browser and in the local pipeline.
 *
 * No public suffix list dependency on purpose: the release path does not run
 * npm install before the systemd timers pick up main, so a small table is used.
 */
import type { FfEvent } from "./events";

export type SourceClass = "official" | "registration" | "listing";

/** Never the original source and never a sign-up or ticket link. */
export const NON_ORIGINAL_DOMAINS: readonly string[] = [
  "activekids.com", "active.com", "lessons.com", "superprof.*", "lantern.llc",
  "coursetakers.com", "classpass.com", "groupon.com", "wellhub.com", "macaronikid.com",
  "parentmap.com", "seattleschild.com", "seattlerefined.com", "allevents.in",
  "happeningnext.com", "patch.com", "yelp.com", "enrichment.kids", "thehomeschoolmom.com",
  "demandforce.com", "bayareaolderadults.org", "findtherun.com", "seatgeek.*", "stubhub.com",
  "vividseats.com", "experienceredmond.com", "discoversantaclara.org", "sanjose.org",
  "woodinvillewinecountry.com", "*.pages.dev",
  // social and link hosts that are never an organizer's own site
  "facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "youtube.com",
  "linktr.ee", "meetup.com", "nextdoor.com", "google.com", "goo.gl", "bit.ly",
];

/** Platforms whose tenant pages are valid sign-up links, never the original source. */
export const REGISTRATION_PLATFORMS: readonly string[] = [
  // subdomain tenants: any subdomain other than www is a tenant, the bare/www host is the root
  "activecommunities.com", "coursestorm.com", "pike13.com",
  // host-level: path "/" without a query is the root
  "app.amilia.com", "portal.iclasspro.com", "app.jackrabbitclass.com",
  "clients.mindbodyonline.com", "app.courtreserve.com", "hisawyer.com", "exploretock.com",
  "runsignup.com", "eventbrite.*",
];

const SUBDOMAIN_TENANT_PLATFORMS = ["activecommunities.com", "coursestorm.com", "pike13.com"];

/** Hosting suffixes where every tenant label is a different owner. */
export const MULTI_TENANT_SUFFIXES: readonly string[] = [
  "squarespace.com", "wixsite.com", "weebly.com", "square.site", "godaddysites.com",
  "wordpress.com", "blogspot.com", "myshopify.com", "webflow.io", "carrd.co", "github.io",
  "netlify.app", "vercel.app", "business.site", "mailchimpsites.com",
];

const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "com.au", "net.au", "org.au", "gov.au",
  "edu.au", "co.nz", "org.nz", "govt.nz", "com.br", "co.jp", "co.in", "com.mx", "co.za",
  "com.sg",
]);

const US_SCHOOL_PREFIXES = new Set(["k12", "cc", "lib"]);

function cleanHost(host: string): string {
  return (host ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

function isIpLiteral(host: string): boolean {
  return host.includes(":") || host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function registrableDomain(host: string): string | null {
  let h = cleanHost(host);
  if (!h || isIpLiteral(h)) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return null;
  if (h.startsWith("www.")) h = h.slice(4);
  const labels = h.split(".");
  if (labels.length < 2) return null;

  for (const s of MULTI_TENANT_SUFFIXES) {
    if (h.endsWith("." + s)) {
      const sl = s.split(".").length;
      return labels.slice(-(sl + 1)).join(".");
    }
  }

  const last2 = labels.slice(-2).join(".");
  let suffixLen = 1;
  if (MULTI_LABEL_SUFFIXES.has(last2)) suffixLen = 2;
  else if (labels[labels.length - 1] === "us" && /^[a-z]{2}$/.test(labels[labels.length - 2])) {
    suffixLen = labels.length >= 3 && US_SCHOOL_PREFIXES.has(labels[labels.length - 3]) ? 3 : 2;
  }
  if (labels.length <= suffixLen) return null;
  return labels.slice(-(suffixLen + 1)).join(".");
}

function matchesEntry(host: string, entry: string): boolean {
  if (entry.startsWith("*.")) return host.endsWith(entry.slice(1));
  if (entry.endsWith(".*")) {
    const name = entry.slice(0, -1);
    const reg = registrableDomain(host);
    return !!reg && reg.startsWith(name);
  }
  return host === entry || host.endsWith("." + entry);
}

function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = cleanHost(u.hostname);
    return host ? u : null;
  } catch {
    return null;
  }
}

export function isListingUrl(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  const host = cleanHost(u.hostname);
  return NON_ORIGINAL_DOMAINS.some((d) => matchesEntry(host, d));
}

function platformMatch(u: URL): { root: boolean } | null {
  const host = cleanHost(u.hostname);
  for (const p of SUBDOMAIN_TENANT_PLATFORMS) {
    if (host === p || host.endsWith("." + p)) {
      const sub = host === p ? "" : host.slice(0, -(p.length + 1));
      return { root: sub === "" || sub === "www" };
    }
  }
  for (const p of REGISTRATION_PLATFORMS) {
    if (SUBDOMAIN_TENANT_PLATFORMS.includes(p)) continue;
    if (matchesEntry(host, p)) {
      return { root: (u.pathname === "/" || u.pathname === "") && !u.search };
    }
  }
  return null;
}

export function isRegistrationPlatformUrl(url: string): boolean {
  const u = parseHttps(url);
  return !!u && platformMatch(u) !== null;
}

export function classifySource(url: string, organizerUrl?: string): SourceClass {
  const u = parseHttps(url);
  if (!u) return "listing";
  if (isListingUrl(url)) return "listing";
  const plat = platformMatch(u);
  if (plat) return plat.root ? "listing" : "registration";
  if (!organizerUrl) return "listing";
  const o = parseHttps(organizerUrl);
  if (!o) return "listing";
  if (isListingUrl(organizerUrl) || platformMatch(o)) return "listing";
  const a = registrableDomain(u.hostname);
  const b = registrableDomain(o.hostname);
  return a && b && a === b ? "official" : "listing";
}

export function sourceKindFor(c: SourceClass): "official" | "listing" | "other" {
  if (c === "official") return "official";
  if (c === "registration") return "other";
  return "listing";
}

export function officialSourceUrl(event: Pick<FfEvent, "sources">): string | undefined {
  return (event.sources ?? []).find((s) => s.kind === "official")?.url;
}

export function hasOfficialSource(event: Pick<FfEvent, "sources">): boolean {
  return !!officialSourceUrl(event);
}
