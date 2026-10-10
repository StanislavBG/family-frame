import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AGE_BANDS,
  EVENT_CATEGORIES,
  EVENTS_LIMITS,
  ffEventSchema,
  type EventCategory,
  type FfEvent,
} from "../../shared/events";

// Normalizer between untrusted web-search output and the repository. All
// candidate text is data: it is validated, stripped and stored, never evaluated.

const MAX_DAYS_AHEAD = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://"), "Must be an https URL");

export const rawCandidateSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().min(1).max(8000),
    start: z.string().min(8).max(40),
    end: z.string().max(40).optional(),
    timezone: z.string().max(64).optional(),
    allDay: z.boolean().optional(),
    recurrenceText: z.string().max(300).optional(),
    occurrences: z
      .array(z.object({ start: z.string().max(40), end: z.string().max(40).optional() }).strict())
      .max(EVENTS_LIMITS.maxOccurrences)
      .optional(),
    venueName: z.string().max(300).optional(),
    address: z.string().max(400).optional(),
    city: z.string().min(1).max(150),
    region: z.string().max(150).optional(),
    country: z.string().min(1).max(150),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    setting: z.enum(["indoor", "outdoor", "mixed", "unknown"]).optional(),
    isFree: z.boolean().optional(),
    priceText: z.string().max(400).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    currency: z.string().max(8).optional(),
    ticketUrl: httpsUrl.optional(),
    registrationRequired: z.boolean().optional(),
    ageMin: z.number().int().min(0).max(120).optional(),
    ageMax: z.number().int().min(0).max(120).optional(),
    ageBands: z.array(z.enum(AGE_BANDS)).max(8).optional(),
    familyFriendly: z.boolean().optional(),
    category: z.string().min(1).max(60),
    tags: z.array(z.string().max(60)).max(EVENTS_LIMITS.maxTags).optional(),
    organizerName: z.string().max(300).optional(),
    organizerUrl: httpsUrl.optional(),
    imageUrl: httpsUrl.optional(),
    sourceUrls: z.array(httpsUrl).min(1).max(EVENTS_LIMITS.maxSources),
    sourceTitles: z.array(z.string().max(300)).max(EVENTS_LIMITS.maxSources).optional(),
    language: z.string().max(8).optional(),
  })
  .strict();
export type RawCandidate = z.infer<typeof rawCandidateSchema>;

const str = (maxLength?: number) => (maxLength ? { type: "string", maxLength } : { type: "string" });
const num = { type: "number" };
const bool = { type: "boolean" };
const urlProp = { type: "string", pattern: "^https://", maxLength: 2000 };

export const RAW_CANDIDATES_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "start", "city", "country", "category", "sourceUrls"],
        properties: {
          title: str(300),
          description: str(8000),
          start: str(40),
          end: str(40),
          timezone: str(64),
          allDay: bool,
          recurrenceText: str(300),
          occurrences: {
            type: "array",
            maxItems: EVENTS_LIMITS.maxOccurrences,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["start"],
              properties: { start: str(40), end: str(40) },
            },
          },
          venueName: str(300),
          address: str(400),
          city: str(150),
          region: str(150),
          country: str(150),
          lat: num,
          lon: num,
          setting: { type: "string", enum: ["indoor", "outdoor", "mixed", "unknown"] },
          isFree: bool,
          priceText: str(400),
          minPrice: num,
          maxPrice: num,
          currency: str(8),
          ticketUrl: urlProp,
          registrationRequired: bool,
          ageMin: { type: "integer", minimum: 0, maximum: 120 },
          ageMax: { type: "integer", minimum: 0, maximum: 120 },
          ageBands: { type: "array", maxItems: 8, items: { type: "string", enum: [...AGE_BANDS] } },
          familyFriendly: bool,
          category: { type: "string", description: `One of: ${EVENT_CATEGORIES.join(", ")}` },
          tags: { type: "array", maxItems: EVENTS_LIMITS.maxTags, items: str(60) },
          organizerName: str(300),
          organizerUrl: urlProp,
          imageUrl: urlProp,
          sourceUrls: { type: "array", minItems: 1, maxItems: EVENTS_LIMITS.maxSources, items: urlProp },
          sourceTitles: { type: "array", maxItems: EVENTS_LIMITS.maxSources, items: str(300) },
          language: str(8),
        },
      },
    },
  },
} as const;

export type NormalizeResult = { ok: true; event: FfEvent } | { ok: false; reason: string };
export type NormalizeOptions = { now: Date; defaultTimezone: string };

// ---- text ----

/** Strip HTML tags and control characters, collapse whitespace. */
export function cleanText(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const opt = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined;
  const c = cleanText(v);
  return c === "" ? undefined : c;
};

const STOPWORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with",
  "annual", "event", "events", "free",
]);

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function titleTokens(title: string): string[] {
  const tokens = foldAccents(cleanText(title))
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "" && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).sort();
}

function normalizeCity(city: string): string {
  return foldAccents(cleanText(city)).split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}

// ---- time ----

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - (utcMs - (utcMs % 1000));
}

/** Instant for an ISO string; offset-less strings are read as wall time in tz. */
function instantMs(iso: string, tz: string): number {
  const direct = Date.parse(iso);
  if (Number.isNaN(direct) || iso.length <= 10 || HAS_OFFSET.test(iso)) {
    if (iso.length > 10 || Number.isNaN(direct)) return direct;
  }
  const asUtc = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : `${iso}Z`);
  if (Number.isNaN(asUtc)) return NaN;
  let guess = asUtc - tzOffsetMs(asUtc, tz);
  guess = asUtc - tzOffsetMs(guess, tz);
  return guess;
}

/** Local YYYY-MM-DD of an ISO string in the given timezone. */
export function localDate(iso: string, tz: string): string {
  if (!HAS_OFFSET.test(iso)) return iso.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.parse(iso)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ---- fingerprint ----

export function fingerprint(event: FfEvent): string {
  const key = [
    titleTokens(event.title).join(" "),
    localDate(event.schedule.start, event.schedule.timezone),
    normalizeCity(event.location.city),
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

export function eventIdFromFingerprint(fp: string): string {
  return `evt_${fp.slice(0, 20)}`;
}

// ---- normalize ----

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function normalizeCandidate(raw: unknown, opts: NormalizeOptions): NormalizeResult {
  const parsed = rawCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `invalid candidate: ${issue.path.join(".") || "(root)"}: ${issue.message}` };
  }
  const c = parsed.data;
  const nowIso = opts.now.toISOString();

  const tz = opt(c.timezone) ?? opts.defaultTimezone;
  if (!validTimezone(tz)) return { ok: false, reason: `invalid timezone: ${tz}` };

  const start = c.start.trim();
  const end = c.end?.trim();
  const startMs = instantMs(start, tz);
  if (Number.isNaN(startMs)) return { ok: false, reason: "invalid start date" };
  if (end !== undefined && Number.isNaN(Date.parse(end))) return { ok: false, reason: "invalid end date" };

  const allDay = c.allDay ?? start.length <= 10;
  const nowMs = opts.now.getTime();
  const startsInPast = allDay
    ? localDate(start, tz) < localDate(nowIso, tz)
    : startMs < nowMs;
  if (startsInPast) return { ok: false, reason: "start date is in the past" };
  if (startMs > nowMs + MAX_DAYS_AHEAD * DAY_MS) {
    return { ok: false, reason: `start is more than ${MAX_DAYS_AHEAD} days ahead` };
  }

  const title = cleanText(c.title);
  const description = cleanText(c.description);
  const city = cleanText(c.city);
  const country = cleanText(c.country);
  if (!title || !description || !city || !country) {
    return { ok: false, reason: "title, description, city or country empty after sanitizing" };
  }

  const category: EventCategory =
    (EVENT_CATEGORIES as readonly string[]).includes(c.category.trim().toLowerCase())
      ? (c.category.trim().toLowerCase() as EventCategory)
      : "other";

  const currency = c.currency?.trim().toUpperCase();
  const tags = Array.from(new Set((c.tags ?? []).map(cleanText).filter(Boolean))).slice(0, EVENTS_LIMITS.maxTags);
  const organizerName = opt(c.organizerName);
  const sourceUrls = Array.from(new Set(c.sourceUrls));

  const event: FfEvent = {
    schemaVersion: 1,
    id: "pending",
    fingerprint: "pending",
    title,
    summary: description.slice(0, 280),
    description,
    category,
    tags,
    schedule: {
      timezone: tz,
      start,
      ...(end ? { end } : {}),
      allDay,
      ...(opt(c.recurrenceText) ? { recurrenceText: opt(c.recurrenceText) } : {}),
      occurrences: (c.occurrences ?? []).map((o) => ({
        start: o.start.trim(),
        ...(o.end ? { end: o.end.trim() } : {}),
      })),
    },
    location: {
      ...(opt(c.venueName) ? { venueName: opt(c.venueName) } : {}),
      ...(opt(c.address) ? { address: opt(c.address) } : {}),
      city,
      ...(opt(c.region) ? { region: opt(c.region) } : {}),
      country,
      ...(c.lat !== undefined ? { lat: c.lat } : {}),
      ...(c.lon !== undefined ? { lon: c.lon } : {}),
      setting: c.setting ?? "unknown",
      online: false,
    },
    cost: {
      isFree: c.isFree ?? c.minPrice === 0,
      ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
      ...(c.minPrice !== undefined ? { minPrice: c.minPrice } : {}),
      ...(c.maxPrice !== undefined ? { maxPrice: c.maxPrice } : {}),
      ...(opt(c.priceText) ? { priceText: opt(c.priceText) } : {}),
      ticketRequired: !!c.ticketUrl,
      registrationRequired: c.registrationRequired ?? false,
      ...(c.ticketUrl ? { ticketUrl: c.ticketUrl } : {}),
    },
    audience: {
      ageBands: c.ageBands && c.ageBands.length > 0 ? Array.from(new Set(c.ageBands)) : ["all-ages"],
      ...(c.ageMin !== undefined ? { ageMin: c.ageMin } : {}),
      ...(c.ageMax !== undefined ? { ageMax: c.ageMax } : {}),
      familyFriendly: c.familyFriendly ?? true,
      languages: c.language ? [c.language.trim()] : [],
    },
    ...(organizerName
      ? { organizer: { name: organizerName, ...(c.organizerUrl ? { url: c.organizerUrl } : {}) } }
      : {}),
    ...(c.imageUrl ? { media: { imageUrl: c.imageUrl } } : {}),
    sources: sourceUrls.map((url, i) => ({
      url,
      ...(opt(c.sourceTitles?.[i]) ? { title: opt(c.sourceTitles?.[i]) } : {}),
      ...(hostOf(url) ? { publisher: hostOf(url) } : {}),
      kind: "listing" as const,
      retrievedAt: nowIso,
    })),
    status: "scheduled",
    updates: [],
    verification: { lastCheckedAt: nowIso, checkCount: 0, confidence: 0.6 },
    firstSeenAt: nowIso,
  };

  event.fingerprint = fingerprint(event);
  event.id = eventIdFromFingerprint(event.fingerprint);

  const checked = ffEventSchema.safeParse(event);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return { ok: false, reason: `invalid event: ${issue.path.join(".")}: ${issue.message}` };
  }
  return { ok: true, event: checked.data };
}

// ---- duplicates ----

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

export function isNearDuplicate(a: FfEvent, b: FfEvent): boolean {
  if (localDate(a.schedule.start, a.schedule.timezone) !== localDate(b.schedule.start, b.schedule.timezone)) {
    return false;
  }
  if (normalizeCity(a.location.city) !== normalizeCity(b.location.city)) return false;
  return jaccard(titleTokens(a.title), titleTokens(b.title)) >= 0.6;
}

function completeness(obj: object): number {
  return Object.values(obj).filter((v) => v !== undefined && v !== "").length;
}

/** Merge a re-found event into the stored one; the stored identity wins. */
export function mergeDuplicate(existing: FfEvent, incoming: FfEvent): FfEvent {
  const seen = new Set<string>();
  const sources = [...existing.sources, ...incoming.sources]
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .slice(0, EVENTS_LIMITS.maxSources);

  const firstSeenAt =
    Date.parse(incoming.firstSeenAt) < Date.parse(existing.firstSeenAt) ? incoming.firstSeenAt : existing.firstSeenAt;

  const cost = completeness(incoming.cost) > completeness(existing.cost) ? incoming.cost : existing.cost;
  const location =
    completeness(incoming.location) > completeness(existing.location) ? incoming.location : existing.location;

  return {
    ...existing,
    description: incoming.description.length > existing.description.length ? incoming.description : existing.description,
    summary: incoming.description.length > existing.description.length ? incoming.summary : existing.summary,
    tags: Array.from(new Set([...existing.tags, ...incoming.tags])).slice(0, EVENTS_LIMITS.maxTags),
    location,
    cost,
    organizer: existing.organizer ?? incoming.organizer,
    media: existing.media ?? incoming.media,
    sources,
    firstSeenAt,
  };
}
