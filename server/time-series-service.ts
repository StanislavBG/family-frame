import { getFirebaseDb } from "./firebase";
import {
  SERIES_ID_PATTERN,
  TS_LIMITS,
  pointKey,
  pointTimeMs,
  putPointsSchema,
  putSeriesSchema,
  timePointSchema,
  type SeriesTagCount,
  type TimePoint,
  type TimeSeries,
} from "@shared/time-series";

export class TimeSeriesError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "TimeSeriesError";
  }
}

export interface TimeSeriesDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are relative paths ("pointKey"), null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
}

export interface ListSeriesOptions {
  tag?: string;
}

export interface ListPointsOptions {
  from?: string;
  to?: string;
  limit?: number;
}

const timeSchema = timePointSchema.shape.t;

// Firebase drops null and empty arrays/objects, so every field is normalized on read.
function toSeries(raw: any): TimeSeries {
  const { annotationsJson, ...rest } = raw;
  return {
    ...rest,
    description: rest.description ?? "",
    summary: rest.summary ?? "",
    tags: rest.tags ?? [],
    unit: rest.unit ?? null,
    color: rest.color ?? null,
    annotations: annotationsJson ? JSON.parse(annotationsJson) : {},
    pointCount: rest.pointCount ?? 0,
    firstT: rest.firstT ?? null,
    lastT: rest.lastT ?? null,
    latest: rest.latest ?? null,
  } as TimeSeries;
}

function toPoint(raw: any): TimePoint {
  const p: TimePoint = { t: raw.t, value: raw.value };
  if (raw.label !== undefined && raw.label !== null) p.label = raw.label;
  if (raw.annotationsJson) p.annotations = JSON.parse(raw.annotationsJson);
  return p;
}

const byTime = (a: { t: string }, b: { t: string }) => pointTimeMs(a.t) - pointTimeMs(b.t) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

export function createTimeSeriesService(deps: TimeSeriesDeps) {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();

  const seriesPath = (u: string) => `timeSeries/${u}/series`;
  const pointsPath = (u: string, s: string) => `timeSeries/${u}/points/${s}`;

  function checkSeriesId(id: string) {
    if (typeof id !== "string" || !SERIES_ID_PATTERN.test(id)) {
      throw new TimeSeriesError("Invalid series id", 400);
    }
  }

  function checkTime(t: unknown): string {
    const parsed = timeSchema.safeParse(t);
    if (!parsed.success) throw new TimeSeriesError(parsed.error.issues.map((i) => i.message).join("; "), 400);
    return parsed.data;
  }

  async function loadSeries(userId: string, id: string): Promise<any> {
    checkSeriesId(id);
    const raw = await deps.get(`${seriesPath(userId)}/${id}`);
    if (!raw) throw new TimeSeriesError("Series not found", 404);
    return raw;
  }

  async function readPoints(userId: string, id: string): Promise<TimePoint[]> {
    const raw = (await deps.get(pointsPath(userId, id))) ?? {};
    return Object.values(raw).map(toPoint).sort(byTime);
  }

  // Denormalize count/first/last/latest onto the series record from stored points.
  async function writeStats(userId: string, id: string, series: any, points: TimePoint[]): Promise<TimeSeries> {
    const last = points[points.length - 1];
    const next = {
      ...series,
      pointCount: points.length,
      firstT: points.length ? points[0].t : null,
      lastT: last ? last.t : null,
      latest: last ? { t: last.t, value: last.value } : null,
      updatedAt: now(),
    };
    await deps.set(`${seriesPath(userId)}/${id}`, next);
    return toSeries(next);
  }

  return {
    async listSeries(userId: string, opts: ListSeriesOptions = {}): Promise<TimeSeries[]> {
      const raw = (await deps.get(seriesPath(userId))) ?? {};
      let all = Object.values(raw).map(toSeries);
      if (opts.tag) all = all.filter((s) => s.tags.includes(opts.tag!));
      return all.sort((a, b) => a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1));
    },

    async listTags(userId: string): Promise<SeriesTagCount[]> {
      const raw = (await deps.get(seriesPath(userId))) ?? {};
      const counts = new Map<string, number>();
      for (const s of Object.values(raw).map(toSeries)) {
        for (const tag of s.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    },

    async getSeries(userId: string, id: string): Promise<TimeSeries> {
      return toSeries(await loadSeries(userId, id));
    },

    async putSeries(userId: string, id: string, input: unknown): Promise<TimeSeries> {
      checkSeriesId(id);
      const parsed = putSeriesSchema.safeParse(input);
      if (!parsed.success) throw new TimeSeriesError(parsed.error.issues.map((i) => i.message).join("; "), 400);
      const d = parsed.data;

      const existing = await deps.get(`${seriesPath(userId)}/${id}`);
      if (!existing) {
        // Cap is read-then-write; a small overshoot under concurrent writers is acceptable.
        const all = (await deps.get(seriesPath(userId))) ?? {};
        if (Object.keys(all).length >= TS_LIMITS.seriesPerUserMax) {
          throw new TimeSeriesError(`Series limit of ${TS_LIMITS.seriesPerUserMax} reached`, 409);
        }
      }
      const ts = now();
      const record = {
        id,
        title: d.title,
        description: d.description ?? "",
        summary: d.summary ?? "",
        tags: d.tags,
        unit: d.unit ?? null,
        color: d.color ?? null,
        annotationsJson: JSON.stringify(d.annotations ?? {}),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
        pointCount: existing?.pointCount ?? 0,
        firstT: existing?.firstT ?? null,
        lastT: existing?.lastT ?? null,
        latest: existing?.latest ?? null,
      };
      await deps.set(`${seriesPath(userId)}/${id}`, record);
      return toSeries(record);
    },

    async deleteSeries(userId: string, id: string): Promise<void> {
      await loadSeries(userId, id);
      await deps.remove(`${seriesPath(userId)}/${id}`);
      await deps.remove(pointsPath(userId, id));
    },

    async putPoints(userId: string, id: string, input: unknown): Promise<{ upserted: number; pointCount: number }> {
      const series = await loadSeries(userId, id);
      const parsed = putPointsSchema.safeParse(input);
      if (!parsed.success) throw new TimeSeriesError(parsed.error.issues.map((i) => i.message).join("; "), 400);

      // Later entries for the same key win within a batch.
      const writes: Record<string, any> = {};
      for (const p of parsed.data.points) {
        const rec: Record<string, any> = { t: p.t, value: p.value };
        if (p.label !== undefined) rec.label = p.label;
        if (p.annotations !== undefined) rec.annotationsJson = JSON.stringify(p.annotations);
        writes[pointKey(p.t)] = rec;
      }

      const existing = (await deps.get(pointsPath(userId, id))) ?? {};
      const total = new Set([...Object.keys(existing), ...Object.keys(writes)]).size;
      if (total > TS_LIMITS.pointsPerSeriesMax) {
        throw new TimeSeriesError(`Series would exceed ${TS_LIMITS.pointsPerSeriesMax} points`, 400);
      }

      await deps.update(pointsPath(userId, id), writes);
      const stored = await readPoints(userId, id);
      await writeStats(userId, id, series, stored);
      return { upserted: Object.keys(writes).length, pointCount: stored.length };
    },

    async listPoints(userId: string, id: string, opts: ListPointsOptions = {}): Promise<TimePoint[]> {
      await loadSeries(userId, id);
      const fromMs = opts.from === undefined ? -Infinity : pointTimeMs(checkTime(opts.from));
      const toMs = opts.to === undefined ? Infinity : pointTimeMs(checkTime(opts.to));
      const requested = Number.isFinite(opts.limit) ? Math.floor(opts.limit as number) : TS_LIMITS.pointsListDefault;
      const limit = Math.min(Math.max(requested, 1), TS_LIMITS.pointsListMax);
      const inRange = (await readPoints(userId, id)).filter((p) => {
        const ms = pointTimeMs(p.t);
        return ms >= fromMs && ms <= toMs;
      });
      // Keep the newest when capped.
      return inRange.length > limit ? inRange.slice(inRange.length - limit) : inRange;
    },

    async deletePoint(userId: string, id: string, t: string): Promise<void> {
      const series = await loadSeries(userId, id);
      const key = pointKey(checkTime(t));
      const path = `${pointsPath(userId, id)}/${key}`;
      if (!(await deps.get(path))) throw new TimeSeriesError("Point not found", 404);
      await deps.remove(path);
      await writeStats(userId, id, series, await readPoints(userId, id));
    },
  };
}

export type TimeSeriesService = ReturnType<typeof createTimeSeriesService>;

let instance: TimeSeriesService | null = null;
function defaultService(): TimeSeriesService {
  if (!instance) {
    instance = createTimeSeriesService({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async update(path, values) {
        await getFirebaseDb().ref(path).update(values);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const timeSeriesService: TimeSeriesService = {
  listSeries: (...args) => defaultService().listSeries(...args),
  listTags: (...args) => defaultService().listTags(...args),
  getSeries: (...args) => defaultService().getSeries(...args),
  putSeries: (...args) => defaultService().putSeries(...args),
  deleteSeries: (...args) => defaultService().deleteSeries(...args),
  putPoints: (...args) => defaultService().putPoints(...args),
  listPoints: (...args) => defaultService().listPoints(...args),
  deletePoint: (...args) => defaultService().deletePoint(...args),
};
