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

function groupTags(tags: NonNullable<PersonDay["tags"]>) {
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const key = t.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), t.label]);
  }
  return Array.from(groups.entries());
}

function TagGroup({ group, labels }: { group: string; labels: string[] }) {
  const shown = labels.slice(0, TAG_LIMIT);
  const extra = labels.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="day-sheet-tag-group">
      {group && (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {group}
        </span>
      )}
      {shown.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className="rounded-full border bg-card px-2.5 py-0.5 text-sm text-foreground"
        >
          {label}
        </span>
      ))}
      {extra > 0 && <span className="text-sm text-muted-foreground">+{extra} more</span>}
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
  const photos = compact ? mediaIds.slice(0, 4) : mediaIds;

  return (
    <article
      className="rounded-xl border bg-card p-4 md:p-6 space-y-4"
      data-testid="day-sheet-card"
    >
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {formatDateDisplay(parseLocalDate(day.date))}
          {day.source ? ` · ${day.source}` : ""}
        </p>
        <h2 className={cn("font-semibold leading-tight", compact ? "text-xl" : "text-2xl md:text-3xl")}>
          {day.title}
        </h2>
        {!compact && day.summary && <p className="text-muted-foreground">{day.summary}</p>}
      </header>

      {metrics.length > 0 && (
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
            <TagGroup key={group} group={group} labels={labels} />
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <ul className="space-y-1.5">
          {(compact ? highlights.slice(0, 3) : highlights).map((h, i) => (
            <li key={i} className="text-base">
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

      {day.sourceUrl && (
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

export function DayTimeline({
  timeline,
  personName,
}: {
  timeline: PersonTimeline | undefined;
  personName: string;
}) {
  const layout = layoutDayTimeline(timeline);
  if (!layout) return null;

  const kinds = Array.from(new Set(layout.events.map((e) => e.kind)));
  const kindColor = (kind: string) => EVENT_COLORS[kinds.indexOf(kind) % EVENT_COLORS.length];

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6" data-testid="day-timeline">
      <h3 className="text-lg font-semibold mb-3">{personName}'s day</h3>
      <div className="overflow-x-auto">
        <div className="relative min-w-[560px] h-40 mx-6">
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
              className="absolute top-14 h-8 rounded-md bg-secondary/30 border border-secondary/60"
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
              className="absolute top-[3.75rem] h-6 rounded-full bg-primary/80 text-primary-foreground text-xs px-2 flex items-center justify-center overflow-hidden whitespace-nowrap"
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
              style={{ left: `${e.left}%`, top: i % 2 === 0 ? "6.5rem" : "0.25rem" }}
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

      {kinds.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="day-timeline-legend">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", kindColor(k))} />
              {k}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
