import { useMemo, useState } from "react";
import { CalendarX } from "lucide-react";
import type { Person } from "@shared/schema";
import type { PersonDay } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { mediaUrl, usePersonDays } from "@/lib/agent-data";
import { formatClock12, formatDurationMinutes, mondayOfIso, spanMinutes, WEEKDAY_SHORT as WEEKDAY } from "@/lib/person-day";
import { parseLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DayTimeline } from "./person-day-sheet";
import { DateBadge, DOW_TONES, LINE, MUTED, SERIF, SURFACE, SectionLabel } from "./satchel";
import { LessonGroups, MetricTiles } from "./satchel-day";

const NAP_BAR_MAX = 60; // px

function napMinutes(day: PersonDay): number {
  return (day.timeline?.spans ?? [])
    .filter((s) => /\bnap/i.test(s.label))
    .reduce((sum, s) => sum + spanMinutes(s.start, s.end), 0);
}

function inOut(day: PersonDay): string {
  const t = day.timeline;
  if (!t?.start) return "";
  return t.end ? `${formatClock12(t.start)}–${formatClock12(t.end)}` : `${formatClock12(t.start)} · in progress`;
}

function NapChart({ days, selected }: { days: PersonDay[]; selected: string }) {
  const naps = days.map((d) => ({ d, min: napMinutes(d) }));
  const max = Math.max(...naps.map((n) => n.min), 1);
  if (naps.every((n) => n.min === 0)) return null;
  return (
    <div className={cn("rounded-[20px] border p-4", SURFACE, LINE)} data-testid="sheets-nap-chart">
      <SectionLabel className="mb-2.5 text-[#3d6a8f] dark:text-[#8fb4d4]">Naps this week</SectionLabel>
      <div className="flex items-end gap-2">
        {naps.map(({ d, min }) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <span className="whitespace-nowrap text-[10px] font-semibold text-[#3d6a8f] dark:text-[#8fb4d4]">
              {min ? formatDurationMinutes(min) : ""}
            </span>
            <div
              className={cn(
                "w-full rounded-lg",
                d.date === selected ? "bg-[#3d6a8f] dark:bg-[#8fb4d4]" : "bg-[#dde8f1] dark:bg-[#8fb4d4]/25",
              )}
              style={{ height: Math.max(4, Math.round((min / max) * NAP_BAR_MAX)) }}
            />
            <span className="text-xs font-semibold">{WEEKDAY[parseLocalDate(d.date).getDay()]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PersonSheets({ person }: { person: Person }) {
  const daysQuery = usePersonDays(person.id, { limit: 60 });
  const [selected, setSelected] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDate = new Map<string, PersonDay>();
    for (const r of daysQuery.data?.records ?? []) {
      if (r.data?.date && !byDate.has(r.data.date)) byDate.set(r.data.date, r.data);
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [daysQuery.data]);

  if (daysQuery.isLoading) {
    return (
      <div className="p-4 space-y-3" data-testid="person-sheets-content">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div data-testid="person-sheets-content" className="h-full">
        <EmptyState
          icon={CalendarX}
          title="No daily sheets yet"
          description={
            daysQuery.isError
              ? `Could not load daily sheets for ${person.name}.`
              : `Daily sheets published for ${person.name} will appear here.`
          }
        />
      </div>
    );
  }

  const day = days.find((d) => d.date === selected) ?? days[0];
  const weekDays = days.filter((d) => mondayOfIso(d.date) === mondayOfIso(day.date)).sort((a, b) => a.date.localeCompare(b.date));
  const date = parseLocalDate(day.date);
  const total = daysQuery.data?.total ?? days.length;
  const photos = day.mediaIds ?? [];

  return (
    <div className="flex flex-col gap-4 px-8 pb-8 pt-6" data-testid="person-sheets-content">
      <header>
        <div className="text-sm font-semibold text-[#7a4a73] dark:text-[#d49ac9]">
          {total} {total === 1 ? "sheet" : "sheets"}
          {day.source ? ` from ${day.source}` : ""}
        </div>
        <h1 className={cn(SERIF, "mt-1 text-4xl font-bold leading-tight")}>Daily sheets</h1>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <NapChart days={weekDays} selected={day.date} />
          <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto" aria-label="Days">
            {days.map((d) => {
              const dd = parseLocalDate(d.date);
              const on = d.date === day.date;
              const nap = napMinutes(d);
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(d.date)}
                  className={cn(
                    "flex items-start gap-3 rounded-[18px] border-2 px-3 py-2.5 text-left",
                    on ? cn(SURFACE, "border-[#a83818] dark:border-[#e07a52]") : "border-transparent hover:bg-[#fffaf0] dark:hover:bg-card",
                  )}
                  data-testid={`day-chip-${d.date}`}
                >
                  <DateBadge tone={DOW_TONES[dd.getDay()]} top={WEEKDAY[dd.getDay()]} num={dd.getDate()} />
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{d.title}</div>
                    <div className={cn("text-xs", MUTED)}>
                      {[nap ? `☾ ${formatDurationMinutes(nap)}` : "", inOut(d)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section className={cn("flex min-w-0 flex-col gap-5 rounded-3xl border p-7", SURFACE, LINE)} data-testid="day-sheet-card">
          <div className="flex items-center gap-4">
            <DateBadge tone={DOW_TONES[date.getDay()]} top={WEEKDAY[date.getDay()]} num={date.getDate()} size={64} />
            <div className="min-w-0">
              <div className={cn("text-sm", MUTED)}>
                {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                {day.source ? ` · from ${day.source}` : ""}
              </div>
              <h2 className={cn(SERIF, "m-0 text-3xl font-bold leading-tight")}>{day.title}</h2>
            </div>
          </div>
          {day.summary && <p className="m-0 text-base">{day.summary}</p>}
          <MetricTiles day={day} />
          <DayTimeline timeline={day.timeline} personName={person.name} date={day.date} source={day.source} />
          <div className="grid gap-6 xl:grid-cols-2">
            {(day.highlights ?? []).length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Moments</SectionLabel>
                {(day.highlights ?? []).map((h, i) => (
                  <div key={i} className="rounded-[14px] bg-[#f5f0e6] px-3.5 py-3 dark:bg-muted">
                    {h.title && <div className="font-bold">{h.title}</div>}
                    <div className="text-[15px] leading-snug">{h.text}</div>
                  </div>
                ))}
              </div>
            )}
            <LessonGroups day={day} />
          </div>
          {photos.length > 0 && (
            <div>
              <SectionLabel className="mb-2">Photos that day</SectionLabel>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2" data-testid="day-sheet-photos">
                {photos.map((id, i) => (
                  <a key={`${id}-${i}`} href={mediaUrl(id)} target="_blank" rel="noopener noreferrer">
                    <img
                      src={mediaUrl(id)}
                      alt={`${person.name}'s photo from ${day.date}`}
                      loading="lazy"
                      className="aspect-square w-full rounded-xl bg-muted object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
          {day.sourceUrl && (
            <a
              href={day.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#a83818] dark:text-[#e07a52]"
            >
              Open original →
            </a>
          )}
        </section>
      </div>
    </div>
  );
}
