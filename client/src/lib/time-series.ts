import { useQuery } from "@tanstack/react-query";
import { pointTimeMs } from "@shared/time-series";
import type { SeriesTagCount, TimePoint, TimeSeries } from "@shared/time-series";
import { apiRequest } from "./queryClient";
import { addDaysIso } from "./person-day";

export interface SeriesPointsOptions {
  from?: string;
  to?: string;
  limit?: number;
}

export const timeSeriesKeys = {
  all: () => ["/api/metrics"] as const,
  list: (tag?: string) => ["/api/metrics", "series", { tag: tag ?? null }] as const,
  points: (seriesId: string | null, opts: SeriesPointsOptions = {}) =>
    ["/api/metrics", "series", seriesId, "points", { from: opts.from ?? null, to: opts.to ?? null, limit: opts.limit ?? null }] as const,
  tags: () => ["/api/metrics", "tags"] as const,
};

function withQuery(path: string, entries: Array<[string, string | number | undefined]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

const get = <T>(url: string) => apiRequest<T>("GET", url);

export function useSeriesList(tag?: string) {
  return useQuery({
    queryKey: timeSeriesKeys.list(tag),
    queryFn: () => get<TimeSeries[]>(withQuery("/api/metrics/series", [["tag", tag || undefined]])),
  });
}

export function useSeriesPoints(seriesId: string | null, opts: SeriesPointsOptions = {}) {
  return useQuery({
    queryKey: timeSeriesKeys.points(seriesId, opts),
    queryFn: () =>
      get<TimePoint[]>(
        withQuery(`/api/metrics/series/${encodeURIComponent(seriesId ?? "")}/points`, [
          ["from", opts.from],
          ["to", opts.to],
          ["limit", opts.limit],
        ]),
      ),
    enabled: seriesId !== null && seriesId !== "",
  });
}

export function useSeriesTags() {
  return useQuery({
    queryKey: timeSeriesKeys.tags(),
    queryFn: () => get<SeriesTagCount[]>("/api/metrics/tags"),
  });
}

// ── Pure logic ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function sortedPoints(points: TimePoint[]): TimePoint[] {
  return [...points].sort((a, b) => pointTimeMs(a.t) - pointTimeMs(b.t));
}

export interface SeriesStats {
  count: number;
  latest: number | null;
  previous: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  sumLast12Months: number | null;
  changePct: number | null;
}

export function seriesStats(points: TimePoint[]): SeriesStats {
  if (points.length === 0) {
    return {
      count: 0, latest: null, previous: null, min: null, max: null, avg: null, median: null,
      sumLast12Months: null, changePct: null,
    };
  }
  const sorted = sortedPoints(points);
  const values = sorted.map((x) => x.value);
  const last = sorted[sorted.length - 1];
  const latest = last.value;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2].value : null;
  const byValue = [...values].sort((a, b) => a - b);
  const mid = Math.floor(byValue.length / 2);
  const median = byValue.length % 2 ? byValue[mid] : (byValue[mid - 1] + byValue[mid]) / 2;
  const cutoff = pointTimeMs(last.t) - 365 * DAY_MS;
  const sumLast12Months = sorted.reduce((sum, x) => (pointTimeMs(x.t) >= cutoff ? sum + x.value : sum), 0);
  return {
    count: sorted.length,
    latest,
    previous,
    min: byValue[0],
    max: byValue[byValue.length - 1],
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    median,
    sumLast12Months,
    changePct: previous === null || previous === 0 ? null : ((latest - previous) / Math.abs(previous)) * 100,
  };
}

export interface MonthBucket {
  month: string;
  sum: number | null;
  count: number;
}

function shiftMonth(month: string, delta: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** `months` consecutive YYYY-MM buckets ending at the latest point's month. */
export function monthlyBuckets(points: TimePoint[], months: number): MonthBucket[] {
  if (points.length === 0 || months <= 0) return [];
  const sorted = sortedPoints(points);
  const lastMonth = sorted[sorted.length - 1].t.slice(0, 7);
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) buckets.push({ month: shiftMonth(lastMonth, -i), sum: null, count: 0 });
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const point of sorted) {
    const i = index.get(point.t.slice(0, 7));
    if (i === undefined) continue;
    buckets[i].sum = (buckets[i].sum ?? 0) + point.value;
    buckets[i].count += 1;
  }
  return buckets;
}

function coord(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** SVG path over evenly spaced values; nulls are skipped but keep their x slot. */
export function sparklinePath(values: Array<number | null>, width: number, height: number, pad = 2): string {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return "";
  const min = Math.min(...present);
  const max = Math.max(...present);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = innerW / (values.length - 1);
  const parts: string[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const y = max === min ? height / 2 : pad + innerH - ((v - min) / (max - min)) * innerH;
    parts.push(`${parts.length === 0 ? "M" : "L"}${coord(pad + i * stepX)},${coord(y)}`);
  });
  return parts.join(" ");
}

export function formatSeriesValue(value: number, unit: string | null | undefined): string {
  if (unit && /^[A-Z]{3}$/.test(unit)) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: unit }).format(value);
    } catch {
      // not a known currency code: fall through to plain formatting
    }
  }
  const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${num} ${unit}` : num;
}

export type DueStatus = "overdue" | "soon" | "later";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function dueStatus(dueDate: string | null | undefined, today: string): DueStatus | null {
  if (!dueDate || !YMD.test(dueDate) || !YMD.test(today)) return null;
  if (dueDate < today) return "overdue";
  return dueDate <= addDaysIso(today, 7) ? "soon" : "later";
}

export type BillStatus = DueStatus | "paid" | "autopay";

const AUTOPAY_STATUSES = new Set(["autopay", "autopay-scheduled"]);

/**
 * Tile status for a bill's latest point: a paid or autopay bill never shows
 * overdue/due soon; otherwise falls back to dueStatus(dueDate).
 */
export function billStatus(annotations: Record<string, unknown> | undefined, today: string): BillStatus | null {
  const paymentStatus = annotations?.paymentStatus;
  if (typeof paymentStatus === "string" && AUTOPAY_STATUSES.has(paymentStatus)) return "autopay";
  if (annotations?.paid === true || paymentStatus === "paid") return "paid";
  const due = annotations?.dueDate;
  return dueStatus(typeof due === "string" ? due : null, today);
}

export type HealthSeverity = "warn" | "alert";

function healthOf(series: TimeSeries): Record<string, unknown> | null {
  const health = series.annotations?.health;
  return health && typeof health === "object" && !Array.isArray(health) ? (health as Record<string, unknown>) : null;
}

/** Warning from series.annotations.health.severity; null when ok or missing. */
export function seriesHealth(series: TimeSeries): { severity: HealthSeverity; text: string } | null {
  const severity = healthOf(series)?.severity;
  if (severity !== "warn" && severity !== "alert") return null;
  const text = series.summary.trim() || (severity === "alert" ? "Needs attention" : "Check this bill");
  return { severity, text };
}

export const STALE_AFTER_MS = 48 * 3_600_000;

/** When the publisher last checked this series: health.checkedAt, else updatedAt. */
export function seriesCheckedAt(series: TimeSeries): string | null {
  const checkedAt = healthOf(series)?.checkedAt;
  if (typeof checkedAt === "string" && !Number.isNaN(Date.parse(checkedAt))) return checkedAt;
  return Number.isNaN(Date.parse(series.updatedAt)) ? null : series.updatedAt;
}

export function isSeriesStale(series: TimeSeries, nowMs: number): boolean {
  const checkedAt = seriesCheckedAt(series);
  return checkedAt !== null && nowMs - Date.parse(checkedAt) > STALE_AFTER_MS;
}

/** Board-level staleness: every series stale; lastChecked is the newest check across them. */
export function boardStaleness(series: TimeSeries[], nowMs: number): { allStale: boolean; lastChecked: string | null } {
  let lastChecked: string | null = null;
  for (const s of series) {
    const checkedAt = seriesCheckedAt(s);
    if (checkedAt && (lastChecked === null || Date.parse(checkedAt) > Date.parse(lastChecked))) lastChecked = checkedAt;
  }
  const allStale = series.length > 0 && series.every((s) => isSeriesStale(s, nowMs));
  return { allStale, lastChecked };
}
