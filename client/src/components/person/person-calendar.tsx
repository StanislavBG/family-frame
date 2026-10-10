import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { CalendarEvent, Person, UserSettings } from "@shared/schema";
import type { PersonDay } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaUrl, usePersonDays } from "@/lib/agent-data";
import { buildMonthCells } from "@/lib/person-day";
import { parseLocalDate, toISODateString } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DOW_TONES, LINE, MUTED, SATCHEL_TONES, SERIF, SURFACE, SectionLabel, ToneChip } from "./satchel";

const UPCOMING_LIMIT = 5;
const CELL_THUMBS = 3;
const PANEL_PHOTOS = 8;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function napText(day: PersonDay): string | undefined {
  return day.metrics?.find((m) => /nap/i.test(m.label))?.value;
}

function DayPanel({
  iso,
  todayIso,
  day,
  events,
  upcoming,
  base,
}: {
  iso: string;
  todayIso: string;
  day?: PersonDay;
  events: CalendarEvent[];
  upcoming: CalendarEvent[];
  base: string;
}) {
  const d = parseLocalDate(iso);
  const tone = SATCHEL_TONES[DOW_TONES[d.getDay()]];
  const photos = (day?.mediaIds ?? []).slice(0, PANEL_PHOTOS);
  const metric = (label: RegExp) => day?.metrics?.find((m) => label.test(m.label))?.value;
  return (
    <aside className={cn("flex flex-col gap-4 rounded-3xl border p-5", SURFACE, LINE)} data-testid="person-calendar-day">
      <div>
        <div className={cn("text-sm font-semibold", tone.fg)}>
          {WEEKDAY[d.getDay()]}
          {iso === todayIso ? " · Today" : ""}
        </div>
        <h2 className={cn(SERIF, "m-0 text-3xl font-bold")}>
          {d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
        </h2>
      </div>
      {events.map((e) => (
        <ToneChip key={e.id} tone="clay" className="self-start text-sm">
          {e.title}
        </ToneChip>
      ))}
      {day && (
        <Link
          href={`${base}/sheets`}
          className="block rounded-2xl bg-[#fcecc4] px-4 py-3 text-[#7a5200] dark:bg-[#f4b942]/15 dark:text-[#f4b942]"
        >
          <div className="text-xs font-bold uppercase tracking-[.06em]">☾ Daily sheet</div>
          <div className="mt-0.5 text-base font-semibold text-[#1a1612] dark:text-foreground">{day.title}</div>
          <div className="mt-1 flex gap-3 text-sm">
            {metric(/^in$/i) && <span>In {metric(/^in$/i)}</span>}
            {metric(/^out$/i) && <span>Out {metric(/^out$/i)}</span>}
            {napText(day) && <span>Nap {napText(day)}</span>}
          </div>
        </Link>
      )}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((id) => (
            <Link key={id} href={`${base}/photos`}>
              <img src={mediaUrl(id)} alt={`Photo from ${iso}`} loading="lazy" className="aspect-square w-full rounded-lg bg-muted object-cover" />
            </Link>
          ))}
        </div>
      )}
      {!day && events.length === 0 && <p className={cn("m-0 text-sm", MUTED)}>Nothing recorded for this day.</p>}
      {upcoming.length > 0 && (
        <div className={cn("border-t border-dashed pt-4", LINE)}>
          <SectionLabel className="mb-2 text-[#a83818] dark:text-[#e07a52]">Coming up</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {upcoming.map((e) => {
              const s = parseLocalDate(e.startDate);
              return (
                <li key={e.id} className="flex items-center gap-2.5" data-testid={`person-calendar-event-${e.id}`}>
                  <ToneChip tone={DOW_TONES[s.getDay()]} className="text-xs">
                    {s.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </ToneChip>
                  <span className="truncate text-base font-medium">{e.title}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

export default function PersonCalendar({ person }: { person: Person }) {
  const base = `/${encodeURIComponent(person.id)}`;
  const todayIso = toISODateString(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(todayIso);
  useEffect(() => setSelected(todayIso), [person.id, todayIso]);

  const { data: settings } = useQuery<UserSettings>({ queryKey: ["/api/settings"] });
  const weekStartsMonday = settings?.weekStartsMonday ?? true;
  const { data: allEvents, isLoading } = useQuery<CalendarEvent[]>({ queryKey: ["/api/calendar/events"] });
  const days = usePersonDays(person.id, { limit: 100 });

  const events = useMemo(() => (allEvents ?? []).filter((e) => e.people?.includes(person.id)), [allEvents, person.id]);
  const dayByDate = useMemo(() => {
    const map = new Map<string, PersonDay>();
    for (const r of days.data?.records ?? []) if (r.data?.date && !map.has(r.data.date)) map.set(r.data.date, r.data);
    return map;
  }, [days.data]);
  const eventsOn = (iso: string) => events.filter((e) => e.startDate <= iso && iso <= e.endDate);
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.endDate >= todayIso)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, UPCOMING_LIMIT),
    [events, todayIso],
  );

  const cells = buildMonthCells(month.getFullYear(), month.getMonth(), weekStartsMonday);
  const headers = cells.slice(0, 7).map((c) => parseLocalDate(c.iso).getDay());
  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(todayIso);
  };
  const navButton = "rounded-full border px-4 py-2 text-base font-semibold";

  return (
    <div className="flex flex-col gap-4 px-8 pb-8 pt-6" data-testid="person-calendar-content">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-sm font-semibold text-[#7a5200] dark:text-[#f4b942]">Calendar</div>
          <h1 className={cn(SERIF, "mt-1 text-4xl font-bold leading-tight")}>
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h1>
        </div>
        <div className="mb-1.5 flex gap-1.5">
          <ToneChip tone="clay">Event</ToneChip>
          <ToneChip tone="sun">☾ Daily sheet</ToneChip>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className={cn(navButton, SURFACE, LINE)} aria-label="Previous month" data-testid="person-calendar-prev">
            ←
          </button>
          <button type="button" onClick={goToday} className={cn(navButton, SURFACE, LINE)} data-testid="person-calendar-today">
            Today
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className={cn(navButton, SURFACE, LINE)} aria-label="Next month" data-testid="person-calendar-next">
            →
          </button>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className={cn("rounded-3xl border p-5", SURFACE, LINE)}>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Month">
              {headers.map((dow) => (
                <div key={dow} className={cn("px-2 pb-1 text-sm font-bold", SATCHEL_TONES[DOW_TONES[dow]].fg)}>
                  {WEEKDAY[dow]}
                </div>
              ))}
              {cells.map((c) => {
                const d = parseLocalDate(c.iso);
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const sheet = dayByDate.get(c.iso);
                const thumbs = sheet?.mediaIds ?? [];
                const isSel = c.iso === selected;
                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => setSelected(c.iso)}
                    className={cn(
                      "flex min-h-[104px] flex-col gap-1 rounded-[14px] border-2 p-2 text-left",
                      isSel
                        ? "border-[#f4b942] bg-[#fcecc4] dark:bg-[#f4b942]/15"
                        : cn("border-transparent", weekend ? "bg-[#f5f0e6] dark:bg-muted" : ""),
                      !c.inMonth && "opacity-40",
                    )}
                    aria-pressed={isSel}
                    data-testid={`person-calendar-cell-${c.iso}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                          c.iso === todayIso && "bg-[#a83818] text-[#fff8ef] dark:bg-[#e07a52]",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {sheet && <span className="text-xs text-[#7a5200] dark:text-[#f4b942]" aria-label="Daily sheet">☾</span>}
                    </div>
                    {eventsOn(c.iso).map((e) => (
                      <span
                        key={e.id}
                        className="truncate rounded-md bg-[#f7ddd0] px-1.5 py-0.5 text-xs font-semibold text-[#a83818] dark:bg-[#e07a52]/15 dark:text-[#e07a52]"
                      >
                        {e.title}
                      </span>
                    ))}
                    {thumbs.length > 0 && (
                      <div className="mt-auto flex items-center gap-1">
                        {thumbs.slice(0, CELL_THUMBS).map((id) => (
                          <img key={id} src={mediaUrl(id)} alt="" loading="lazy" className="h-6 w-6 rounded bg-muted object-cover" />
                        ))}
                        {thumbs.length > CELL_THUMBS && (
                          <span className={cn("text-[11px]", MUTED)}>+{thumbs.length - CELL_THUMBS}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <DayPanel
          iso={selected}
          todayIso={todayIso}
          day={dayByDate.get(selected)}
          events={eventsOn(selected)}
          upcoming={upcoming}
          base={base}
        />
      </div>
    </div>
  );
}
