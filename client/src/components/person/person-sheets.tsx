import { useEffect, useMemo, useState } from "react";
import { CalendarX } from "lucide-react";
import type { Person } from "@shared/schema";
import type { PersonDay, PersonWeek } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { usePersonDays, usePersonWeeks } from "@/lib/agent-data";
import { parseLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DaySheetCard, DayTimeline } from "./person-day-sheet";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

function toKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** weekStart of the week record covering `date`, else the Monday on or before it. */
function weekKeyFor(date: string, weekStarts: string[]): string {
  const t = Math.round(parseLocalDate(date).getTime() / DAY_MS);
  for (const ws of weekStarts) {
    const w = Math.round(parseLocalDate(ws).getTime() / DAY_MS);
    if (t >= w && t < w + 7) return ws;
  }
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toKey(d);
}

export default function PersonSheets({ person }: { person: Person }) {
  const daysQuery = usePersonDays(person.id, { limit: 60 });
  const weeksQuery = usePersonWeeks(person.id, { limit: 12 });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setSelected(null), [person.id]);

  const days = useMemo(() => {
    const byDate = new Map<string, PersonDay>();
    for (const r of daysQuery.data?.records ?? []) {
      if (r.data?.date && !byDate.has(r.data.date)) byDate.set(r.data.date, r.data);
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [daysQuery.data]);

  const weeks = useMemo(
    () => (weeksQuery.data?.records ?? []).map((r) => r.data).filter((w): w is PersonWeek => !!w?.weekStart),
    [weeksQuery.data],
  );

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

  const weekStarts = weeks.map((w) => w.weekStart);
  const day = days.find((d) => d.date === selected) ?? days[0];
  const weekKey = weekKeyFor(day.date, weekStarts);
  const weekDays = days
    .filter((d) => weekKeyFor(d.date, weekStarts) === weekKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const week = weeks.find((w) => w.weekStart === weekKey);

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="person-sheets-content">
      {week && (
        <section className="rounded-xl border bg-card p-4 space-y-1.5" data-testid="person-week-summary">
          <h2 className="text-lg font-semibold">{week.title}</h2>
          {week.summary && <p className="text-muted-foreground">{week.summary}</p>}
          {week.highlights && week.highlights.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5">
              {week.highlights.map((h, i) => (
                <li key={i}>{h.text}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Days">
        {weekDays.map((d) => {
          const date = parseLocalDate(d.date);
          const active = d.date === day.date;
          return (
            <button
              key={d.date}
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(d.date)}
              className={cn(
                "shrink-0 min-w-14 rounded-lg border px-3 py-2 text-center hover-elevate",
                active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground",
              )}
              data-testid={`day-chip-${d.date}`}
            >
              <div className="text-xs uppercase">{WEEKDAYS[date.getDay()]}</div>
              <div className="text-lg font-semibold">{date.getDate()}</div>
            </button>
          );
        })}
      </div>

      <DayTimeline timeline={day.timeline} personName={person.name} date={day.date} source={day.source} />
      <DaySheetCard day={day} personName={person.name} />
    </div>
  );
}
