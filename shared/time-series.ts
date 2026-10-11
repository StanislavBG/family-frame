import { z } from "zod";

// Schemas, types and limits for the per-user time-series ("metrics") store:
// agents publish named series (tags, description, summary, free-form
// annotations) and timestamped numeric points.

export const SERIES_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const TS_LIMITS = {
  seriesPerUserMax: 200,
  tagsMax: 10,
  titleMax: 120,
  descriptionMax: 2000,
  summaryMax: 4000,
  unitMax: 24,
  labelMax: 200,
  annotationsBytesMax: 16384,
  pointAnnotationsBytesMax: 2048,
  pointsPerSeriesMax: 5000,
  batchMax: 500,
  pointsListDefault: 1000,
  pointsListMax: 5000,
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// The calendar date must exist (2026-02-30 is rejected).
function isRealDate(ymd: string): boolean {
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === ymd;
}

function isValidPointTime(t: string): boolean {
  if (DATE_PATTERN.test(t)) return isRealDate(t);
  if (DATETIME_PATTERN.test(t)) return isRealDate(t.slice(0, 10)) && !Number.isNaN(Date.parse(t));
  return false;
}

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((s) => TAG_PATTERN.test(s), "Invalid tag");

const jsonObjectSchema = (maxBytes: number) =>
  z.record(z.unknown()).refine(
    (x) =>
      typeof x === "object" &&
      x !== null &&
      !Array.isArray(x) &&
      new TextEncoder().encode(JSON.stringify(x)).length <= maxBytes,
    `Must be a JSON object of at most ${maxBytes} bytes`,
  );

export const putSeriesSchema = z
  .object({
    title: z.string().trim().min(1).max(TS_LIMITS.titleMax),
    description: z.string().max(TS_LIMITS.descriptionMax).optional(),
    summary: z.string().max(TS_LIMITS.summaryMax).optional(),
    tags: z
      .array(tagSchema)
      .max(TS_LIMITS.tagsMax)
      .default([])
      .transform((tags) => Array.from(new Set(tags))),
    unit: z.string().trim().min(1).max(TS_LIMITS.unitMax).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    annotations: jsonObjectSchema(TS_LIMITS.annotationsBytesMax).optional(),
  })
  .strict();

export const timePointSchema = z
  .object({
    t: z.string().refine(isValidPointTime, "Must be YYYY-MM-DD or an ISO-8601 datetime with Z or offset"),
    value: z.number().finite(),
    label: z.string().max(TS_LIMITS.labelMax).optional(),
    annotations: jsonObjectSchema(TS_LIMITS.pointAnnotationsBytesMax).optional(),
  })
  .strict();

export const putPointsSchema = z
  .object({ points: z.array(timePointSchema).min(1).max(TS_LIMITS.batchMax) })
  .strict();

// Firebase RTDB keys may not contain '.'; ':' is allowed.
export function pointKey(t: string): string {
  return t.replace(/\./g, "_");
}

// A YYYY-MM-DD date parses as UTC midnight.
export function pointTimeMs(t: string): number {
  return Date.parse(t);
}

export type TimePoint = {
  t: string;
  value: number;
  label?: string;
  annotations?: Record<string, unknown>;
};

export type TimeSeries = {
  id: string;
  title: string;
  description: string;
  summary: string;
  tags: string[];
  unit: string | null;
  color: string | null;
  annotations: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  pointCount: number;
  firstT: string | null;
  lastT: string | null;
  latest: { t: string; value: number } | null;
};

export type PutSeriesInput = z.input<typeof putSeriesSchema>;
export type PutPointsInput = z.input<typeof putPointsSchema>;
export type SeriesTagCount = { tag: string; count: number };
