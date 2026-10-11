import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ffEventSchema, type FfEvent, type HouseholdResponse, type RecommendationInput } from "../../shared/events";

export type EventsDb = DatabaseSync;

const SCHEMA_VERSION = 3;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  fingerprint TEXT UNIQUE,
  area_key TEXT,
  json TEXT,
  start_at TEXT,
  end_at TEXT,
  status TEXT,
  first_seen_at TEXT,
  last_checked_at TEXT,
  next_check_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_area_start ON events(area_key, start_at);
CREATE INDEX IF NOT EXISTS idx_events_next_check ON events(next_check_at);
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  address_json TEXT,
  address_hash TEXT,
  lat REAL,
  lon REAL,
  area_key TEXT,
  profile_json TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS recommendations (
  household_id TEXT,
  event_id TEXT,
  published_at TEXT,
  published_hash TEXT,
  response TEXT,
  published_json TEXT,
  PRIMARY KEY (household_id, event_id)
);
CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_key TEXT,
  window_key TEXT,
  category_key TEXT,
  query TEXT,
  ran_at TEXT,
  results INTEGER,
  run_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_log_lookup ON search_log(area_key, window_key, category_key);
CREATE TABLE IF NOT EXISTS geocode_cache (
  query_hash TEXT PRIMARY KEY,
  query TEXT,
  lat REAL,
  lon REAL,
  provider TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  kind TEXT,
  started_at TEXT,
  finished_at TEXT,
  stats_json TEXT,
  error TEXT
);
`;

/** Open (and create if needed) the pipeline database. ':memory:' is allowed. */
export function openEventsDb(path: string): EventsDb {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA_SQL);
  // v2: last published RecommendationInput, so the dispatcher can re-push text.
  const cols = db.prepare("PRAGMA table_info(recommendations)").all();
  if (!cols.some((c) => c.name === "published_json")) {
    db.exec("ALTER TABLE recommendations ADD COLUMN published_json TEXT");
  }
  // v3: watch bookkeeping, so a cheap frequent check can find households needing discovery.
  const hCols = db.prepare("PRAGMA table_info(households)").all();
  for (const col of ["last_discovered_at", "last_triggered_at"]) {
    if (!hCols.some((c) => c.name === col)) db.exec(`ALTER TABLE households ADD COLUMN ${col} TEXT`);
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function str(v: unknown): string {
  return v as string;
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : (v as string);
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

// ---- events ----

/**
 * Insert or update a canonical event, keyed by id. The event is validated with
 * ffEventSchema first. A different id carrying an already-stored fingerprint
 * violates the UNIQUE constraint and throws: look up getEventByFingerprint
 * before building a new event.
 */
export function upsertEvent(db: EventsDb, event: FfEvent, areaKey: string, nextCheckAt: string): void {
  const e = ffEventSchema.parse(event);
  db.prepare(
    `INSERT INTO events (id, fingerprint, area_key, json, start_at, end_at, status,
       first_seen_at, last_checked_at, next_check_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       fingerprint = excluded.fingerprint,
       area_key = excluded.area_key,
       json = excluded.json,
       start_at = excluded.start_at,
       end_at = excluded.end_at,
       status = excluded.status,
       last_checked_at = excluded.last_checked_at,
       next_check_at = excluded.next_check_at,
       updated_at = excluded.updated_at`,
  ).run(
    e.id,
    e.fingerprint,
    areaKey,
    JSON.stringify(e),
    e.schedule.start,
    e.schedule.end ?? null,
    e.status,
    e.firstSeenAt,
    e.verification.lastCheckedAt,
    nextCheckAt,
    new Date().toISOString(),
  );
}

function parseEvent(row: Record<string, unknown> | undefined): FfEvent | null {
  return row ? (JSON.parse(str(row.json)) as FfEvent) : null;
}

export function getEventByFingerprint(db: EventsDb, fingerprint: string): FfEvent | null {
  return parseEvent(db.prepare("SELECT json FROM events WHERE fingerprint = ?").get(fingerprint));
}

export function getEvent(db: EventsDb, id: string): FfEvent | null {
  return parseEvent(db.prepare("SELECT json FROM events WHERE id = ?").get(id));
}

/** Events in an area that overlap [fromIso, toIso], ordered by start. */
export function listEventsInArea(db: EventsDb, areaKey: string, fromIso: string, toIso: string): FfEvent[] {
  return db
    .prepare(
      `SELECT json FROM events
       WHERE area_key = ? AND start_at <= ? AND COALESCE(end_at, start_at) >= ?
       ORDER BY start_at, id`,
    )
    .all(areaKey, toIso, fromIso)
    .map((r) => JSON.parse(str(r.json)) as FfEvent);
}

/** Events whose next_check_at has passed, oldest first, skipping ended or cancelled ones. */
export function listDueForRecheck(db: EventsDb, nowIso: string, limit: number): FfEvent[] {
  return db
    .prepare(
      `SELECT json FROM events
       WHERE next_check_at <= ? AND status NOT IN ('ended', 'cancelled')
       ORDER BY next_check_at, id
       LIMIT ?`,
    )
    .all(nowIso, limit)
    .map((r) => JSON.parse(str(r.json)) as FfEvent);
}

// ---- households ----

export interface HouseholdRecord {
  id: string;
  address: unknown;
  addressHash: string;
  lat: number | null;
  lon: number | null;
  areaKey: string;
  profile: unknown;
  updatedAt: string;
}

export interface LocalHouseholdRecord extends HouseholdRecord {
  lastDiscoveredAt: string | null;
  lastTriggeredAt: string | null;
}

export function upsertHousehold(db: EventsDb, h: HouseholdRecord): void {
  db.prepare(
    `INSERT INTO households (id, address_json, address_hash, lat, lon, area_key, profile_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       address_json = excluded.address_json,
       address_hash = excluded.address_hash,
       lat = excluded.lat,
       lon = excluded.lon,
       area_key = excluded.area_key,
       profile_json = excluded.profile_json,
       updated_at = excluded.updated_at`,
  ).run(h.id, JSON.stringify(h.address ?? null), h.addressHash, h.lat, h.lon, h.areaKey, JSON.stringify(h.profile ?? null), h.updatedAt);
}

export function listHouseholds(db: EventsDb): LocalHouseholdRecord[] {
  return db
    .prepare("SELECT * FROM households ORDER BY id")
    .all()
    .map((r) => ({
      id: str(r.id),
      address: JSON.parse(str(r.address_json)) as unknown,
      addressHash: str(r.address_hash),
      lat: numOrNull(r.lat),
      lon: numOrNull(r.lon),
      areaKey: str(r.area_key),
      profile: JSON.parse(str(r.profile_json)) as unknown,
      updatedAt: str(r.updated_at),
      lastDiscoveredAt: strOrNull(r.last_discovered_at),
      lastTriggeredAt: strOrNull(r.last_triggered_at),
    }));
}

/** Record that the watcher started discovery for a household (no-op if it has no local row yet). */
export function markHouseholdTriggered(db: EventsDb, id: string, iso: string): void {
  db.prepare("UPDATE households SET last_triggered_at = ? WHERE id = ?").run(iso, id);
}

/** Record that a discover pass finished for a household (no-op if it has no local row). */
export function markHouseholdDiscovered(db: EventsDb, id: string, iso: string): void {
  db.prepare("UPDATE households SET last_discovered_at = ? WHERE id = ?").run(iso, id);
}

/** Remove a household and every recommendation recorded for it. */
export function deleteHousehold(db: EventsDb, householdId: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM recommendations WHERE household_id = ?").run(householdId);
    db.prepare("DELETE FROM households WHERE id = ?").run(householdId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---- recommendations ----

export interface RecommendationRecord {
  householdId: string;
  eventId: string;
  publishedAt: string;
  publishedHash: string;
  response: HouseholdResponse | null;
}

/** Record a publication; a missing response keeps the previously stored one. */
export function recordRecommendation(
  db: EventsDb,
  r: Omit<RecommendationRecord, "response"> & {
    response?: HouseholdResponse | null;
    /** The RecommendationInput as published; a missing value keeps the stored one. */
    published?: RecommendationInput | null;
  },
): void {
  db.prepare(
    `INSERT INTO recommendations (household_id, event_id, published_at, published_hash, response, published_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(household_id, event_id) DO UPDATE SET
       published_at = excluded.published_at,
       published_hash = excluded.published_hash,
       response = COALESCE(excluded.response, recommendations.response),
       published_json = COALESCE(excluded.published_json, recommendations.published_json)`,
  ).run(
    r.householdId,
    r.eventId,
    r.publishedAt,
    r.publishedHash,
    r.response ?? null,
    r.published ? JSON.stringify(r.published) : null,
  );
}

/** The last RecommendationInput published for a household/event, or null if none was stored. */
export function getPublishedRecommendation(db: EventsDb, householdId: string, eventId: string): RecommendationInput | null {
  const row = db
    .prepare("SELECT published_json FROM recommendations WHERE household_id = ? AND event_id = ?")
    .get(householdId, eventId);
  const json = strOrNull(row?.published_json);
  return json ? (JSON.parse(json) as RecommendationInput) : null;
}

export function listRecommendationsForHousehold(db: EventsDb, householdId: string): RecommendationRecord[] {
  return db
    .prepare("SELECT * FROM recommendations WHERE household_id = ? ORDER BY published_at, event_id")
    .all(householdId)
    .map((r) => ({
      householdId: str(r.household_id),
      eventId: str(r.event_id),
      publishedAt: str(r.published_at),
      publishedHash: str(r.published_hash),
      response: strOrNull(r.response) as HouseholdResponse | null,
    }));
}

/** Ids of households that currently hold a recommendation for the event. */
export function listHouseholdsHoldingEvent(db: EventsDb, eventId: string): string[] {
  return db
    .prepare("SELECT household_id FROM recommendations WHERE event_id = ? ORDER BY household_id")
    .all(eventId)
    .map((r) => str(r.household_id));
}

// ---- search log ----

export interface SearchLogEntry {
  areaKey: string;
  windowKey: string;
  categoryKey: string;
  query: string;
  ranAt: string;
  results: number;
  runId?: string | null;
}

export function logSearch(db: EventsDb, s: SearchLogEntry): void {
  db.prepare(
    `INSERT INTO search_log (area_key, window_key, category_key, query, ran_at, results, run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(s.areaKey, s.windowKey, s.categoryKey, s.query, s.ranAt, s.results, s.runId ?? null);
}

export function lastSearchAt(db: EventsDb, areaKey: string, windowKey: string, categoryKey: string): string | null {
  const row = db
    .prepare("SELECT MAX(ran_at) AS ran_at FROM search_log WHERE area_key = ? AND window_key = ? AND category_key = ?")
    .get(areaKey, windowKey, categoryKey);
  return strOrNull(row?.ran_at);
}

// ---- geocode cache ----

export interface GeocodeRecord {
  queryHash: string;
  query: string;
  lat: number;
  lon: number;
  provider: string;
  createdAt: string;
}

export function getGeocode(db: EventsDb, queryHash: string): GeocodeRecord | null {
  const r = db.prepare("SELECT * FROM geocode_cache WHERE query_hash = ?").get(queryHash);
  if (!r) return null;
  return {
    queryHash: str(r.query_hash),
    query: str(r.query),
    lat: Number(r.lat),
    lon: Number(r.lon),
    provider: str(r.provider),
    createdAt: str(r.created_at),
  };
}

export function putGeocode(db: EventsDb, g: GeocodeRecord): void {
  db.prepare(
    `INSERT INTO geocode_cache (query_hash, query, lat, lon, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(query_hash) DO UPDATE SET
       query = excluded.query, lat = excluded.lat, lon = excluded.lon,
       provider = excluded.provider, created_at = excluded.created_at`,
  ).run(g.queryHash, g.query, g.lat, g.lon, g.provider, g.createdAt);
}

// ---- runs ----

/** Start a run and return its id. */
export function startRun(db: EventsDb, kind: string, startedAt: string, id: string = randomUUID()): string {
  db.prepare("INSERT INTO runs (id, kind, started_at) VALUES (?, ?, ?)").run(id, kind, startedAt);
  return id;
}

export function finishRun(db: EventsDb, id: string, finishedAt: string, stats: unknown, error?: string | null): void {
  const params: SQLInputValue[] = [finishedAt, JSON.stringify(stats ?? null), error ?? null, id];
  db.prepare("UPDATE runs SET finished_at = ?, stats_json = ?, error = ? WHERE id = ?").run(...params);
}
