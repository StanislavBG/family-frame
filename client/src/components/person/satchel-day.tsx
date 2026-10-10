// Day-sheet building blocks in the Satchel style, shared by the Dashboard and Daily sheets.
import type { PersonDay, PersonTimeline } from "@shared/person-views";
import { axisHourLabel, eventTone, layoutDayTimeline, type EventTone } from "@/lib/person-day";
import { cn } from "@/lib/utils";
import {
  CHIP_CYCLE,
  MetricTile,
  MONO,
  MUTED,
  SATCHEL_TONES,
  SectionLabel,
  TILE_CYCLE,
  ToneChip,
  type SatchelTone,
} from "./satchel";

const EVENT_DOT: Record<EventTone, SatchelTone> = { dry: "stone", wet: "sky", bm: "clay", other: "leaf" };

export function MetricTiles({ day, className, compact = false }: { day: PersonDay; className?: string; compact?: boolean }) {
  const metrics = day.metrics ?? [];
  if (metrics.length === 0) return null;
  return (
    <div className={cn("grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(88px,1fr))]", className)}>
      {metrics.map((m, i) => (
        <MetricTile key={`${m.label}-${i}`} tone={TILE_CYCLE[i % TILE_CYCLE.length]} label={m.label} value={m.value} size={compact ? "text-xl" : "text-2xl"} />
      ))}
    </div>
  );
}

/** Compact 40px day strip: school band, nap boxes, event dots, five axis labels. */
export function MiniTimeline({ timeline }: { timeline: PersonTimeline | undefined }) {
  const layout = layoutDayTimeline(timeline);
  if (!layout) return null;
  const range = layout.windowEnd - layout.windowStart;
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const minute = Math.round((layout.windowStart + f * range) / 60) * 60;
    return axisHourLabel(minute, f === 0 || f === 1).replace(" AM", "am").replace(" PM", "pm");
  });
  return (
    <div data-testid="mini-timeline">
      <div className="relative h-10 rounded-xl bg-[#f5f0e6] dark:bg-muted">
        {layout.band && (
          <div
            className="absolute inset-y-1.5 rounded-lg bg-[#fcecc4] dark:bg-[#f4b942]/15"
            style={{ left: `${layout.band.left}%`, width: `${layout.band.width}%` }}
          />
        )}
        {layout.spans.map((s, i) => (
          <div
            key={i}
            className="absolute inset-y-1.5 flex items-center justify-center rounded-lg border-2 border-[#3d6a8f] bg-[#dde8f1] text-[10px] font-bold text-[#3d6a8f] dark:border-[#8fb4d4] dark:bg-[#8fb4d4]/15 dark:text-[#8fb4d4]"
            style={{ left: `${s.left}%`, width: `${Math.max(s.width, 2)}%` }}
          >
            ☾
          </div>
        ))}
        {layout.events.map((e, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-[13px] -ml-[7px] h-3.5 w-3.5 rounded-full border-2 border-[#fffaf0] dark:border-card",
              SATCHEL_TONES[EVENT_DOT[eventTone(e.kind)]].solid,
            )}
            style={{ left: `${e.left}%` }}
          />
        ))}
      </div>
      <div className={cn(MONO, "mt-0.5 flex justify-between px-0.5 text-[11px]", MUTED)}>
        {axis.map((a, i) => (
          <span key={i}>{a}</span>
        ))}
      </div>
    </div>
  );
}

export function Moments({ day, limit }: { day: PersonDay; limit?: number }) {
  const highlights = (day.highlights ?? []).slice(0, limit);
  if (highlights.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Moments</SectionLabel>
      {highlights.map((h, i) => (
        <div key={i} className="text-base leading-snug">
          {h.title && <b>{h.title} </b>}
          <span className="text-[#3a342b] dark:text-foreground/80">
            {h.title ? "— " : ""}
            {h.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tags grouped by `group`, each group a row of tinted chips with "+N more" past `limit`. */
export function LessonGroups({ day, limit }: { day: PersonDay; limit?: number }) {
  const groups = new Map<string, string[]>();
  for (const t of day.tags ?? []) groups.set(t.group ?? "", [...(groups.get(t.group ?? "") ?? []), t.label]);
  if (groups.size === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {Array.from(groups.entries()).map(([group, labels]) => {
        const shown = limit ? labels.slice(0, limit) : labels;
        const extra = labels.length - shown.length;
        return (
          <div key={group} className="flex flex-col gap-1.5" data-testid="day-sheet-tag-group">
            {group && <SectionLabel>{group}</SectionLabel>}
            <div className="flex flex-wrap gap-1.5">
              {shown.map((label, i) => (
                <ToneChip key={`${label}-${i}`} tone={CHIP_CYCLE[i % CHIP_CYCLE.length]} className="max-w-full truncate">
                  {label}
                </ToneChip>
              ))}
              {extra > 0 && <span className={cn("px-2 py-1 text-[13px]", MUTED)}>+{extra} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
