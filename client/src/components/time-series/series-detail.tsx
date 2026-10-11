import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { pointTimeMs } from "@shared/time-series";
import type { TimePoint, TimeSeries } from "@shared/time-series";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SERIF } from "@/components/person/satchel";
import { SeriesLineChart } from "@/components/time-series/series-chart";
import { formatRelativeTime } from "@/lib/format";
import { formatSeriesValue, seriesStats, useSeriesPoints } from "@/lib/time-series";

export interface AnnotationEntry {
  key: string;
  text: string;
  isJson: boolean;
}

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || value === undefined || typeof value !== "object";
}

/** Flattens an annotations object: primitives become text, objects/arrays pretty JSON. */
export function annotationEntries(obj: Record<string, unknown> | null | undefined): AnnotationEntry[] {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) =>
    isPrimitive(value)
      ? { key, text: value === null || value === undefined ? "" : String(value), isJson: false }
      : { key, text: JSON.stringify(value, null, 2), isJson: true },
  );
}

const INLINE_NOTES = 4;
const PAGE_SIZE = 50;

function PointNotes({ annotations }: { annotations?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const entries = annotationEntries(annotations);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  const inline = entries.filter((e) => !e.isJson).slice(0, INLINE_NOTES);
  const rest = entries.filter((e) => !inline.includes(e));
  return (
    <div className="space-y-1">
      {inline.map((e) => (
        <div key={e.key} className="text-sm">
          <span className="text-muted-foreground">{e.key}:</span> {e.text}
        </div>
      ))}
      {rest.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1 py-0.5 text-xs"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="button-point-more"
          >
            {open ? "less" : `more (${rest.length})`}
          </Button>
          {open &&
            rest.map((e) =>
              e.isJson ? (
                <div key={e.key} className="text-sm">
                  <span className="text-muted-foreground">{e.key}:</span>
                  <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{e.text}</pre>
                </div>
              ) : (
                <div key={e.key} className="text-sm">
                  <span className="text-muted-foreground">{e.key}:</span> {e.text}
                </div>
              ),
            )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </div>
    </div>
  );
}

interface SeriesDetailProps {
  series: TimeSeries;
  onBack: () => void;
}

export function SeriesDetail({ series, onBack }: SeriesDetailProps) {
  const { data, isLoading } = useSeriesPoints(series.id, { limit: 5000 });
  const [showAll, setShowAll] = useState(false);
  const points: TimePoint[] = data ?? [];
  const stats = useMemo(() => seriesStats(points), [points]);
  const newestFirst = useMemo(
    () => [...points].sort((a, b) => pointTimeMs(b.t) - pointTimeMs(a.t)),
    [points],
  );
  const visible = showAll ? newestFirst : newestFirst.slice(0, PAGE_SIZE);
  const details = annotationEntries(series.annotations);
  const fmt = (v: number | null) => (v === null ? "—" : formatSeriesValue(v, series.unit));

  return (
    <div className="space-y-6" data-testid="series-detail">
      <Button variant="ghost" onClick={onBack} data-testid="button-series-back">
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back
      </Button>

      <div className="space-y-2">
        <h2 className={`${SERIF} text-3xl font-semibold text-foreground`}>{series.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {series.unit && <Badge variant="secondary">{series.unit}</Badge>}
          {series.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          <span className="text-sm text-muted-foreground">Updated {formatRelativeTime(series.updatedAt)}</span>
        </div>
        {series.description && <p className="whitespace-pre-line text-foreground">{series.description}</p>}
        {series.summary && <p className="whitespace-pre-line text-muted-foreground">{series.summary}</p>}
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <SeriesLineChart points={points} unit={series.unit} color={series.color} height={300} />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Latest" value={fmt(stats.latest)} />
        <Stat
          label="Change %"
          value={stats.changePct === null ? "—" : `${stats.changePct > 0 ? "+" : ""}${stats.changePct.toFixed(1)}%`}
        />
        <Stat label="Average" value={fmt(stats.avg)} />
        <Stat label="Median" value={fmt(stats.median)} />
        <Stat label="Min" value={fmt(stats.min)} />
        <Stat label="Max" value={fmt(stats.max)} />
        <Stat label="Last 12 months" value={fmt(stats.sumLast12Months)} />
      </div>

      {details.length > 0 && (
        <section className="space-y-2" data-testid="series-details">
          <h3 className={`${SERIF} text-xl font-semibold text-foreground`}>Details</h3>
          <dl className="space-y-2">
            {details.map((e) => (
              <div key={e.key} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
                <dt className="text-sm text-muted-foreground">{e.key}</dt>
                <dd className="text-sm text-foreground">
                  {e.isJson ? (
                    <pre className="max-h-60 overflow-auto rounded bg-muted p-2 text-xs">{e.text}</pre>
                  ) : (
                    e.text
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-2">
        <h3 className={`${SERIF} text-xl font-semibold text-foreground`}>Points</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm" data-testid="table-series-points">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.t} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-2">{p.t.slice(0, 10)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatSeriesValue(p.value, series.unit)}</td>
                  <td className="px-3 py-2">{p.label ?? ""}</td>
                  <td className="px-3 py-2">
                    <PointNotes annotations={p.annotations} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAll && newestFirst.length > PAGE_SIZE && (
          <Button variant="outline" onClick={() => setShowAll(true)} data-testid="button-show-all-points">
            Show all ({newestFirst.length})
          </Button>
        )}
      </section>
    </div>
  );
}
