import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
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
  dueStatus,
  formatSeriesValue,
  monthlyBuckets,
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

function dueDateOf(points: TimePoint[]): string | null {
  if (points.length === 0) return null;
  const latest = points.reduce((a, b) => (Date.parse(b.t) >= Date.parse(a.t) ? b : a));
  const due = latest.annotations?.dueDate;
  return typeof due === "string" ? due : null;
}

function SeriesTile({
  series,
  boardTag,
  points,
  loading,
  onSelect,
}: {
  series: TimeSeries;
  boardTag: string;
  points: TimePoint[];
  loading: boolean;
  onSelect: (seriesId: string) => void;
}) {
  const today = useToday();
  const stats = seriesStats(points);
  const color = series.color || "hsl(var(--primary))";
  const otherTags = series.tags.filter((t) => t !== boardTag);
  const dueDate = dueDateOf(points);
  const status = dueStatus(dueDate, today);
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

          {dueDate && (
            <div className="flex items-center gap-2 text-sm">
              <span>Due {dueDate}</span>
              {status === "overdue" && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">Overdue</Badge>
              )}
              {status === "soon" && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Due soon</Badge>
              )}
            </div>
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
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
