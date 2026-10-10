import { ExternalLink } from "lucide-react";
import type { PersonDay, PersonMetric, PersonTimeline } from "@shared/person-views";
import { mediaUrl } from "@/lib/agent-data";
import {
  axisHourLabel,
  eventLanes,
  eventTone,
  eventTypeLabel,
  formatClock12,
  formatDurationMinutes,
  halfHourTicks,
  layoutDayTimeline,
  spanMinutes,
  type EventTone,
} from "@/lib/person-day";
import { formatDateDisplay, parseLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<NonNullable<PersonMetric["tone"]>, string> = {
  neutral: "bg-muted text-foreground border-border",
  good: "bg-secondary/25 text-foreground border-secondary/50",
  warn: "bg-accent/35 text-foreground border-accent/60",
  info: "bg-primary/10 text-foreground border-primary/30",
};

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

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const MONO_DARK = "dark:font-['JetBrains_Mono',ui-monospace,monospace]";
const SERIF = "font-['Source_Serif_4',Georgia,serif]";

// Daily-sheet palette from the "Day Timeline Zoom" design: light, then dark.
const TONE_STYLES: Record<EventTone, { pill: string; dot: string; legend: string }> = {
  dry: {
    pill: "bg-[#ece6da] text-[#5d5648] dark:bg-transparent dark:text-[#c9bfa9]",
    dot: "bg-[#5d5648] dark:bg-[#c9bfa9]",
    legend: "bg-[#9c937f] dark:bg-[#c9bfa9]",
  },
  wet: {
    pill: "bg-[#dde8f1] text-[#3d6a8f] dark:bg-transparent dark:text-[#8fb4d4]",
    dot: "bg-[#3d6a8f] dark:bg-[#8fb4d4]",
    legend: "bg-[#3d6a8f] dark:bg-[#8fb4d4]",
  },
  bm: {
    pill: "bg-[#f7ddd0] text-[#a83818] dark:bg-transparent dark:text-[#e07a52]",
    dot: "bg-[#a83818] dark:bg-[#e07a52]",
    legend: "bg-[#a83818] dark:bg-[#e07a52]",
  },
  other: {
    pill: "bg-[#eedfec] text-[#7a4a73] dark:bg-transparent dark:text-[#d49ac9]",
    dot: "bg-[#7a4a73] dark:bg-[#d49ac9]",
    legend: "bg-[#7a4a73] dark:bg-[#d49ac9]",
  },
};

const CHIP_STYLES = {
  school: "bg-[#fcecc4] text-[#7a5200] dark:bg-transparent dark:border-[#f4b942] dark:text-[#f4b942]",
  span: "bg-[#dde8f1] text-[#3d6a8f] dark:bg-transparent dark:border-[#8fb4d4] dark:text-[#8fb4d4]",
  events: "bg-[#eedfec] text-[#7a4a73] dark:bg-transparent dark:border-[#d49ac9] dark:text-[#d49ac9]",
};

// Track geometry (px). Events sit in lanes; crowded events push the track taller.
const TRACK_BASE = 112;
const LANE_TOP = 34;
const LANE_HEIGHT = 60;
const EVENT_MIN_GAP = 7; // % of the window between two event labels in one lane

const isNap = (label: string) => /\bnap/i.test(label);

function TimelineChip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-[13px]",
        "dark:rounded-md dark:px-2.5 dark:py-[5px] dark:text-xs",
        MONO_DARK,
        className,
      )}
    >
      {children}
    </span>
  );
}

function dayHeading(date: string | undefined): string | null {
  if (!date) return null;
  return parseLocalDate(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function DayTimeline({
  timeline,
  personName,
  date,
  source,
  compact = false,
}: {
  timeline: PersonTimeline | undefined;
  personName: string;
  date?: string;
  source?: string;
  compact?: boolean;
}) {
  const layout = layoutDayTimeline(timeline);
  if (!layout) return null;

  const range = layout.windowEnd - layout.windowStart;
  const ticks = halfHourTicks(layout.windowStart, layout.windowEnd);
  const hours = layout.ticks.map((t, i) => ({
    left: ((t.minute - layout.windowStart) / range) * 100,
    label: axisHourLabel(t.minute, i === 0 || i === layout.ticks.length - 1),
  }));
  const lanes = eventLanes(layout.events.map((e) => e.left), EVENT_MIN_GAP, layout.spans);
  const laneCount = lanes.length > 0 ? Math.max(...lanes) + 1 : 1;
  const trackHeight = TRACK_BASE + (laneCount - 1) * LANE_HEIGHT;

  const schoolMinutes =
    timeline?.start && timeline?.end ? spanMinutes(timeline.start, timeline.end) : 0;
  const spanTotals = new Map<string, number>();
  for (const s of layout.spans) {
    const key = isNap(s.label) ? "Napped" : s.label;
    spanTotals.set(key, (spanTotals.get(key) ?? 0) + spanMinutes(s.start, s.end));
  }
  const diaperCount = layout.events.filter((e) => eventTone(e.kind) !== "other").length;
  const otherCount = layout.events.length - diaperCount;
  const tones = Array.from(new Set(layout.events.map((e) => eventTone(e.kind))));
  const legend = Array.from(
    new Map(layout.events.map((e) => [eventTypeLabel(e.kind, e.label), eventTone(e.kind)])).entries(),
  );

  const heading = dayHeading(date);
  const windowLabel = `${axisHourLabel(layout.windowStart, true)} – ${axisHourLabel(layout.windowEnd, true)}`;

  return (
    <section
      className={cn(
        "flex flex-col rounded-3xl border border-[#e3dcc8] bg-[#fffaf0] text-[#1a1612]",
        "dark:rounded-2xl dark:border-[#3a342b] dark:bg-[#221d18] dark:text-[#f5f0e6]",
        compact ? "gap-3 px-5 py-4" : "gap-4 px-[26px] pb-5 pt-[22px]",
      )}
      data-testid="day-timeline"
    >
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h3 className={cn(SERIF, "m-0 text-2xl font-semibold")}>{personName}'s day</h3>
        <span className="text-sm text-[#5d5648] dark:text-[#9c937f]">
          {heading ? `${heading} · ` : ""}
          {windowLabel}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5" data-testid="day-timeline-summary">
          {schoolMinutes > 0 && (
            <TimelineChip className={CHIP_STYLES.school}>
              <b>{formatDurationMinutes(schoolMinutes)}</b> at school
            </TimelineChip>
          )}
          {Array.from(spanTotals.entries()).map(([label, minutes]) => (
            <TimelineChip key={label} className={CHIP_STYLES.span}>
              {label} <b>{formatDurationMinutes(minutes)}</b>
            </TimelineChip>
          ))}
          {diaperCount > 0 && (
            <TimelineChip className={CHIP_STYLES.events}>
              <b>{diaperCount}</b> {diaperCount === 1 ? "diaper" : "diapers"}
            </TimelineChip>
          )}
          {otherCount > 0 && (
            <TimelineChip className={CHIP_STYLES.events}>
              <b>{otherCount}</b> {otherCount === 1 ? "event" : "events"}
            </TimelineChip>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div
            className="relative rounded-[14px] bg-[#f5f0e6] dark:rounded-lg dark:border dark:border-[#2a241c] dark:bg-[#1a1612]"
            style={{ height: trackHeight }}
            data-testid="day-timeline-track"
          >
            {ticks.map((t) => (
              <div
                key={t.left}
                className={cn(
                  "absolute inset-y-0 border-l border-[#e3dcc8] dark:border-[#2e2820]",
                  t.dashed && "border-dashed",
                )}
                style={{ left: `${t.left}%` }}
              />
            ))}

            {layout.band && (
              <>
                <div
                  className="absolute inset-y-1.5 rounded-xl border-2 border-[#f4b942] bg-[rgba(244,185,66,.22)] dark:rounded-md dark:border-[1.5px] dark:bg-[rgba(244,185,66,.08)]"
                  style={{ left: `${layout.band.left}%`, width: `${layout.band.width}%` }}
                  data-testid="day-timeline-band"
                />
                {timeline?.start && (
                  <span
                    className={cn(MONO, "absolute top-3 ml-2.5 text-xs font-bold text-[#7a5200] dark:text-[#f4b942]")}
                    style={{ left: `${layout.band.left}%` }}
                  >
                    In {formatClock12(timeline.start)}
                  </span>
                )}
                {timeline?.end && (
                  <span
                    className={cn(
                      MONO,
                      "absolute top-3 -ml-2.5 -translate-x-full whitespace-nowrap text-xs font-bold text-[#7a5200] dark:text-[#f4b942]",
                    )}
                    style={{ left: `${layout.band.left + layout.band.width}%` }}
                  >
                    Out {formatClock12(timeline.end)}
                  </span>
                )}
              </>
            )}

            {layout.spans.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className={cn(
                  MONO,
                  "absolute top-10 flex h-10 items-center justify-center overflow-hidden whitespace-nowrap rounded-[10px] border-2 border-[#3d6a8f] bg-[#dde8f1] px-1 text-xs font-bold text-[#3d6a8f]",
                  "dark:rounded-md dark:border-[1.5px] dark:border-[#8fb4d4] dark:bg-[rgba(143,180,212,.15)] dark:text-[#8fb4d4]",
                )}
                style={{ left: `${s.left}%`, width: `${Math.max(s.width, 2)}%` }}
                data-testid="day-timeline-span"
              >
                {isNap(s.label) ? "☾" : s.label} {formatClock12(s.start)}–{formatClock12(s.end)} ·{" "}
                {formatDurationMinutes(spanMinutes(s.start, s.end))}
              </div>
            ))}

            {layout.events.map((e, i) => {
              const tone = TONE_STYLES[eventTone(e.kind)];
              return (
                <div
                  key={`${e.time}-${i}`}
                  className="absolute z-10 flex -translate-x-1/2 flex-col items-center gap-[3px]"
                  style={{ left: `${e.left}%`, top: LANE_TOP + lanes[i] * LANE_HEIGHT }}
                  data-testid="day-timeline-event"
                >
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-full px-2 py-px text-[11px] font-bold dark:px-0 dark:py-0",
                      MONO_DARK,
                      tone.pill,
                    )}
                  >
                    {eventTypeLabel(e.kind, e.label)}
                  </span>
                  <span
                    className={cn(
                      "h-[18px] w-[18px] rounded-full border-[3px] border-[#fffaf0] dark:h-4 dark:w-4 dark:border-0",
                      tone.dot,
                    )}
                  />
                  <span className={cn(MONO, "text-[11px] font-semibold text-[#3a342b] dark:text-[#f4b942]")}>
                    {formatClock12(e.time)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="relative mt-1.5 h-4">
            {hours.map((h, i) => (
              <span
                key={h.left}
                className={cn(
                  MONO,
                  "absolute whitespace-nowrap text-xs text-[#5d5648] dark:text-[#c9bfa9]",
                  // Edge labels align inward so the scroll container doesn't clip them.
                  i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: `${h.left}%` }}
              >
                {h.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!compact && (legend.length > 0 || tones.length > 0) && (
        <div
          className="flex flex-wrap gap-[18px] text-[13px] text-[#5d5648] dark:text-[#c9bfa9]"
          data-testid="day-timeline-legend"
        >
          {legend.map(([label, tone]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-full", TONE_STYLES[tone].legend)} />
              {label}
            </span>
          ))}
          <span className="ml-auto dark:text-[#9c937f]">
            From the daily sheet{source ? ` · ${source}` : ""}
          </span>
        </div>
      )}
    </section>
  );
}
