import { ExternalLink } from "lucide-react";
import type { PersonDay, PersonMetric, PersonTimeline } from "@shared/person-views";
import { mediaUrl } from "@/lib/agent-data";
import { formatDurationMinutes, layoutDayTimeline, spanMinutes } from "@/lib/person-day";
import { formatDateDisplay, parseLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<NonNullable<PersonMetric["tone"]>, string> = {
  neutral: "bg-muted text-foreground border-border",
  good: "bg-secondary/25 text-foreground border-secondary/50",
  warn: "bg-accent/35 text-foreground border-accent/60",
  info: "bg-primary/10 text-foreground border-primary/30",
};

const EVENT_COLORS = [
  "bg-primary",
  "bg-secondary",
  "bg-accent",
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
];

const TAG_LIMIT = 5;
const COMPACT_TAG_LIMIT = 3;

function groupTags(tags: NonNullable<PersonDay["tags"]>) {
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const key = t.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), t.label]);
  }
  return Array.from(groups.entries());
}

function TagGroup({ group, labels, compact = false }: { group: string; labels: string[]; compact?: boolean }) {
  const shown = labels.slice(0, compact ? COMPACT_TAG_LIMIT : TAG_LIMIT);
  const extra = labels.length - shown.length;
  return (
    <div
      className={cn("flex items-center gap-1.5", compact ? "flex-nowrap overflow-hidden" : "flex-wrap")}
      data-testid="day-sheet-tag-group"
    >
      {group && (
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {group}
        </span>
      )}
      {shown.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className={cn(
            "rounded-full border bg-card px-2.5 py-0.5 text-foreground",
            compact ? "min-w-0 max-w-[18rem] truncate text-base" : "text-sm",
          )}
        >
          {label}
        </span>
      ))}
      {extra > 0 && (
        <span className={cn("shrink-0 text-muted-foreground", compact ? "text-base" : "text-sm")}>
          +{extra} more
        </span>
      )}
    </div>
  );
}

export function DaySheetCard({
  day,
  personName,
  compact = false,
}: {
  day: PersonDay;
  personName: string;
  compact?: boolean;
}) {
  const metrics = day.metrics ?? [];
  const tags = day.tags ?? [];
  const highlights = day.highlights ?? [];
  const mediaIds = day.mediaIds ?? [];
  const photos = compact ? [] : mediaIds;

  return (
    <article
      className={cn("rounded-xl border bg-card", compact ? "p-4 space-y-3" : "p-4 md:p-6 space-y-4")}
      data-testid="day-sheet-card"
    >
      <header className={cn(compact ? "flex flex-wrap items-baseline gap-x-3" : "space-y-1")}>
        <p className={cn("text-muted-foreground", compact ? "order-2 text-base" : "text-sm")}>
          {formatDateDisplay(parseLocalDate(day.date))}
          {day.source ? ` · ${day.source}` : ""}
        </p>
        <h2 className={cn("font-semibold leading-tight", compact ? "text-2xl" : "text-2xl md:text-3xl")}>
          {day.title}
        </h2>
        {!compact && day.summary && <p className="text-muted-foreground">{day.summary}</p>}
      </header>

      {compact && metrics.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
          {metrics.map((m, i) => (
            <div key={`${m.label}-${i}`} className="flex items-baseline gap-2" data-testid="day-sheet-metric">
              <span className="text-sm uppercase tracking-wide text-muted-foreground">{m.label}</span>
              <span className="text-3xl font-semibold tabular-nums">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {!compact && metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {metrics.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className={cn("rounded-lg border px-3 py-2", TONE_CLASSES[m.tone ?? "neutral"] ?? TONE_CLASSES.neutral)}
              data-testid="day-sheet-metric"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
              <div className="text-lg font-semibold">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="space-y-2">
          {groupTags(tags).map(([group, labels]) => (
            <TagGroup key={group} group={group} labels={labels} compact={compact} />
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="space-y-1.5">
          {(compact ? highlights.slice(0, 1) : highlights).map((h, i) => (
            <li key={i} className={cn("text-base", compact && "line-clamp-1")}>
              {h.title && <span className="font-semibold">{h.title} — </span>}
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="day-sheet-photos">
          {photos.map((id) => (
            <a key={id} href={mediaUrl(id)} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img
                src={mediaUrl(id)}
                alt={`${personName}'s photo from ${day.date}`}
                loading="lazy"
                className="h-24 w-24 md:h-28 md:w-28 rounded-lg object-cover bg-muted"
              />
            </a>
          ))}
        </div>
      )}

      {!compact && day.sourceUrl && (
        <a
          href={day.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open original
        </a>
      )}
    </article>
  );
}

// Vertical geometry (rem) of the timeline lanes; compact is the wall-display Dashboard.
const TIMELINE_GEOMETRY = {
  full: { height: "h-40", band: "top-14 h-8", span: "top-[3.75rem] h-6", above: "0.25rem", below: "6.5rem" },
  compact: { height: "h-[8.5rem]", band: "top-11 h-7", span: "top-12 h-5", above: "0rem", below: "4.75rem" },
};

export function DayTimeline({
  timeline,
  personName,
  compact = false,
}: {
  timeline: PersonTimeline | undefined;
  personName: string;
  compact?: boolean;
}) {
  const layout = layoutDayTimeline(timeline);
  if (!layout) return null;

  const kinds = Array.from(new Set(layout.events.map((e) => e.kind)));
  const kindColor = (kind: string) => EVENT_COLORS[kinds.indexOf(kind) % EVENT_COLORS.length];
  const geo = compact ? TIMELINE_GEOMETRY.compact : TIMELINE_GEOMETRY.full;

  const legend = kinds.length > 0 && (
    <ul
      className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", !compact && "mt-3")}
      data-testid="day-timeline-legend"
    >
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", kindColor(k))} />
          {k}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      className={cn("rounded-xl border bg-card", compact ? "px-4 py-3" : "p-4 md:p-6")}
      data-testid="day-timeline"
    >
      {compact ? (
        <div className="mb-1 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">{personName}'s day</h3>
          {legend}
        </div>
      ) : (
        <h3 className="text-lg font-semibold mb-3">{personName}'s day</h3>
      )}
      <div className="overflow-x-auto">
        <div className={cn("relative min-w-[560px] mx-6", geo.height)}>
          {layout.ticks.map((t) => (
            <div
              key={t.minute}
              className="absolute top-0 bottom-6 border-l border-border/60"
              style={{ left: `${((t.minute - layout.windowStart) / (layout.windowEnd - layout.windowStart)) * 100}%` }}
            >
              <span className="absolute -bottom-6 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground">
                {t.label}
              </span>
            </div>
          ))}

          {layout.band && (
            <div
              className={cn("absolute rounded-md", geo.band, "bg-secondary/30 border border-secondary/60")}
              style={{ left: `${layout.band.left}%`, width: `${layout.band.width}%` }}
              data-testid="day-timeline-band"
            >
              <span className="absolute -top-5 left-0 text-xs text-muted-foreground whitespace-nowrap">
                {timeline?.start ? `In ${timeline.start}` : ""}
              </span>
              <span className="absolute -top-5 right-0 text-xs text-muted-foreground whitespace-nowrap">
                {timeline?.end ? `Out ${timeline.end}` : ""}
              </span>
            </div>
          )}

          {layout.spans.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className={cn(
                "absolute rounded-full bg-primary/80 text-primary-foreground text-xs px-2 flex items-center justify-center overflow-hidden whitespace-nowrap",
                geo.span,
              )}
              style={{ left: `${s.left}%`, width: `${Math.max(s.width, 2)}%` }}
              title={`${s.label} ${s.start}–${s.end}`}
              data-testid="day-timeline-span"
            >
              {s.label} · {formatDurationMinutes(spanMinutes(s.start, s.end))}
            </div>
          ))}

          {layout.events.map((e, i) => (
            <div
              key={`${e.time}-${i}`}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${e.left}%`, top: i % 2 === 0 ? geo.below : geo.above }}
              data-testid="day-timeline-event"
            >
              <span className={cn("h-3 w-3 rounded-full ring-2 ring-card", kindColor(e.kind))} />
              <span className="mt-0.5 text-[11px] leading-tight text-center whitespace-nowrap">
                {e.label}
                <br />
                <span className="text-muted-foreground">{e.time}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {!compact && legend}
    </section>
  );
}
