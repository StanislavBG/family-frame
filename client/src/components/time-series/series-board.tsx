import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, Clock, LineChart } from "lucide-react";
import type { TimePoint, TimeSeries } from "@shared/time-series";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import {
  billStatus,
  boardStaleness,
  formatSeriesValue,
  isSeriesStale,
  monthlyBuckets,
  seriesHealth,
  seriesStats,
  timeSeriesKeys,
  useSeriesList,
} from "@/lib/time-series";
import { Sparkline } from "./series-chart";

const POINTS_OPTS = { limit: 400 } as const;
const SPARK_MONTHS = 12;
const ALL = "__all__";

interface SeriesBoardProps {
  tag: string;
  title: string;
  onSelect: (seriesId: string) => void;
}

function pointsQuery(seriesId: string) {
  return {
    queryKey: timeSeriesKeys.points(seriesId, POINTS_OPTS),
    queryFn: () =>
      apiRequest<TimePoint[]>(
        "GET",
        `/api/metrics/series/${encodeURIComponent(seriesId)}/points?limit=${POINTS_OPTS.limit}`,
      ),
  };
}

function latestPointOf(points: TimePoint[]): TimePoint | null {
  if (points.length === 0) return null;
  return points.reduce((a, b) => (Date.parse(b.t) >= Date.parse(a.t) ? b : a));
}

function formatCheckedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SeriesTile({
  series,
  boardTag,
  points,
  loading,
  stale,
  onSelect,
}: {
  series: TimeSeries;
  boardTag: string;
  points: TimePoint[];
  loading: boolean;
  stale: boolean;
  onSelect: (seriesId: string) => void;
}) {
  const today = useToday();
  const stats = seriesStats(points);
  const color = series.color || "hsl(var(--primary))";
  const otherTags = series.tags.filter((t) => t !== boardTag);
  const annotations = latestPointOf(points)?.annotations;
  const dueDate = typeof annotations?.dueDate === "string" ? annotations.dueDate : null;
  const status = billStatus(annotations, today);
  const health = seriesHealth(series);
  const latestValue = stats.latest ?? series.latest?.value ?? null;
  const latestDate = (series.latest?.t ?? series.lastT ?? "").slice(0, 10);
  const spark = monthlyBuckets(points, SPARK_MONTHS).map((b) => b.sum);

  return (
    <button
      type="button"
      onClick={() => onSelect(series.id)}
      data-testid={`tile-series-${series.id}`}
      className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full hover-elevate">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold truncate">{series.title}</h3>
          </div>

          <div>
            <p className="text-4xl font-bold tracking-tight">
              {latestValue === null ? "No data" : formatSeriesValue(latestValue, series.unit)}
            </p>
            {latestDate && <p className="text-sm text-muted-foreground">{latestDate}</p>}
          </div>

          {(dueDate || status === "paid" || status === "autopay") && (
            <div className="flex items-center gap-2 text-sm">
              {dueDate && <span>Due {dueDate}</span>}
              {status === "paid" && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">Paid</Badge>
              )}
              {status === "autopay" && (
                <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">Autopay</Badge>
              )}
              {status === "overdue" && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">Overdue</Badge>
              )}
              {status === "soon" && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Due soon</Badge>
              )}
            </div>
          )}

          {health && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                health.severity === "alert"
                  ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
              )}
              role="status"
              data-testid={`health-${health.severity}-${series.id}`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="line-clamp-3">{health.text}</span>
            </div>
          )}

          {stale && (
            <p
              className="flex items-center gap-1 text-sm text-amber-800 dark:text-amber-200"
              data-testid={`stale-${series.id}`}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              Not updated recently
            </p>
          )}

          {loading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Sparkline values={spark} color={series.color ?? undefined} className="h-8 w-full" />
          )}

          {stats.avg !== null && stats.min !== null && stats.max !== null && (
            <p className="text-sm text-muted-foreground">
              Avg {formatSeriesValue(stats.avg, series.unit)} · {formatSeriesValue(stats.min, series.unit)}–
              {formatSeriesValue(stats.max, series.unit)}
            </p>
          )}

          {otherTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {otherTags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

export function SeriesBoard({ tag, title, onSelect }: SeriesBoardProps) {
  const list = useSeriesList(tag);
  const [filter, setFilter] = useState<string>(ALL);
  // Re-renders at midnight, so a wall display re-evaluates staleness at least daily.
  useToday();
  const nowMs = Date.now();

  const all = list.data ?? [];
  const secondaryTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of all) for (const t of s.tags) if (t !== tag) set.add(t);
    return Array.from(set).sort();
  }, [all, tag]);

  const activeFilter = filter !== ALL && secondaryTags.includes(filter) ? filter : ALL;
  const visible = activeFilter === ALL ? all : all.filter((s) => s.tags.includes(activeFilter));

  const pointResults = useQueries({ queries: all.map((s) => pointsQuery(s.id)) });
  const pointsById = new Map<string, { points: TimePoint[]; loading: boolean }>();
  all.forEach((s, i) => {
    pointsById.set(s.id, { points: pointResults[i]?.data ?? [], loading: pointResults[i]?.isLoading ?? false });
  });

  const staleness = boardStaleness(all, nowMs);

  const totals = new Map<string, number>();
  for (const s of visible) {
    const sum = seriesStats(pointsById.get(s.id)?.points ?? []).sumLast12Months;
    if (sum === null) continue;
    const unitKey = s.unit ?? "";
    totals.set(unitKey, (totals.get(unitKey) ?? 0) + sum);
  }

  if (list.isLoading) {
    return (
      <div className="p-4 space-y-4" data-testid="series-board-loading">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (list.isError) {
    return (
      <div className="p-8 text-center text-red-700 dark:text-red-300" role="alert" data-testid="series-board-error">
        Could not load {title.toLowerCase()}. Please try again.
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title={`No ${title.toLowerCase()} yet`}
        description={`An agent publishes series with tag "${tag}" via the metrics API or the MCP tool metrics_put_series.`}
      />
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="series-board">
      <h2 className="text-2xl font-semibold">{title}</h2>

      {staleness.allStale && (
        <div
          className="flex items-center gap-2 rounded-lg bg-amber-100 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="alert"
          data-testid="series-board-stale"
        >
          <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-lg">
            {staleness.lastChecked
              ? `${title} not updated since ${formatCheckedDate(staleness.lastChecked)}`
              : `${title} not updated recently`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-6 rounded-lg border bg-card p-4" data-testid="series-board-totals">
        {Array.from(totals.entries()).map(([unit, sum]) => (
          <div key={unit || "none"}>
            <p className="text-3xl font-bold">{formatSeriesValue(sum, unit || null)}</p>
            <p className="text-sm text-muted-foreground">Last 12 months</p>
          </div>
        ))}
        <div>
          <p className="text-3xl font-bold">{visible.length}</p>
          <p className="text-sm text-muted-foreground">series</p>
        </div>
      </div>

      {secondaryTags.length >= 2 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
          {[ALL, ...secondaryTags].map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={activeFilter === t ? "default" : "outline"}
              aria-pressed={activeFilter === t}
              onClick={() => setFilter(t)}
              className={cn("capitalize")}
              data-testid={`filter-tag-${t === ALL ? "all" : t}`}
            >
              {t === ALL ? "All" : t}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((s) => (
          <SeriesTile
            key={s.id}
            series={s}
            boardTag={tag}
            points={pointsById.get(s.id)?.points ?? []}
            loading={pointsById.get(s.id)?.loading ?? false}
            stale={!staleness.allStale && isSeriesStale(s, nowMs)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
