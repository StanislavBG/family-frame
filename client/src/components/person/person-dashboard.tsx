import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { UserRound } from "lucide-react";
import type { CalendarEvent, Person } from "@shared/schema";
import type { PersonDay, PersonWeek } from "@shared/person-views";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  mediaUrl,
  useMailMessages,
  useMediaList,
  usePersonDays,
  usePersonWeeks,
} from "@/lib/agent-data";
import { addDaysIso, isCurrentWeek, mondayOfIso, pickCurrentDay, pickCurrentWeek, WEEKDAY_SHORT as WEEKDAY } from "@/lib/person-day";
import { parseLocalDate } from "@/lib/format";
import { useToday } from "@/hooks/use-today";
import { cn } from "@/lib/utils";
import { DateBadge, DOW_TONES, LINE, MUTED, SATCHEL_TONES, SERIF, SURFACE, SectionLabel, ToneChip } from "./satchel";
import { LessonGroups, MetricTiles, MiniTimeline, Moments } from "./satchel-day";

const UPCOMING_COUNT = 3;
const STRIP_PHOTOS = 10;

const longDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** Mon–Fri ISO dates of the week starting at `weekStart`. */
function weekdays(weekStart: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDaysIso(weekStart, i));
}

function TodaySheet({
  day,
  days,
  onPick,
  base,
  todayIso,
}: {
  day: PersonDay;
  days: PersonDay[];
  onPick: (date: string) => void;
  base: string;
  todayIso: string;
}) {
  const photos = (day.mediaIds ?? []).slice(0, 6);
  const date = parseLocalDate(day.date);
  return (
    <section
      className={cn("overflow-hidden rounded-3xl border-2 border-[#f4b942]", SURFACE)}
      data-testid="dashboard-sheet"
    >
      <div className="flex flex-wrap items-center gap-3 bg-[#fcecc4] px-5 py-3 text-[#7a5200] dark:bg-[#f4b942]/15 dark:text-[#f4b942]">
        <span className="whitespace-nowrap text-xs font-bold uppercase tracking-[.06em]">
          ☾ {day.date === todayIso ? "Today's daily sheet" : `Daily sheet · ${WEEKDAY[date.getDay()]}`}
        </span>
        <span className="whitespace-nowrap text-sm">
          {longDate(date)}
          {day.source ? ` · from ${day.source}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {days.map((d) => {
            const dd = parseLocalDate(d.date);
            const tone = SATCHEL_TONES[DOW_TONES[dd.getDay()]];
            const on = d.date === day.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onPick(d.date)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-bold",
                  on ? cn(tone.solid, "text-[#fffaf0] dark:text-background") : cn(SURFACE, tone.fg),
                )}
                aria-pressed={on}
                data-testid={`dashboard-day-chip-${d.date}`}
              >
                {WEEKDAY[dd.getDay()]} {dd.getDate()}
              </button>
            );
          })}
        </div>
        <Link
          href={`${base}/sheets`}
          className="whitespace-nowrap text-sm font-semibold text-[#a83818] dark:text-[#e07a52]"
          data-testid="link-dashboard-sheets"
        >
          Full sheet →
        </Link>
      </div>
      <div className="flex flex-wrap gap-6 px-5 pb-5 pt-4">
        <div className="flex min-w-0 flex-[1.4_1_340px] flex-col gap-3">
          <h2 className={cn(SERIF, "m-0 text-2xl font-bold leading-tight")}>{day.title}</h2>
          <MetricTiles day={day} compact />
          <MiniTimeline timeline={day.timeline} />
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
          <Moments day={day} limit={2} />
          <LessonGroups day={day} limit={5} />
        </div>
        {photos.length > 0 && (
          <div className="min-w-0 max-w-[300px] flex-[1_1_220px]">
            <SectionLabel className="mb-2">
              {(day.mediaIds ?? []).length} {(day.mediaIds ?? []).length === 1 ? "photo" : "photos"}
            </SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((id, i) => (
                <Link key={`${id}-${i}`} href={`${base}/photos`}>
                  <img
                    src={mediaUrl(id)}
                    alt={`Photo from ${day.date}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-[10px] bg-muted object-cover"
                  />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function WeekInShort({ week, dayCount, current }: { week: PersonWeek; dayCount: number; current: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] bg-[#fcecc4] px-6 py-5 dark:bg-[#f4b942]/15"
      data-testid="dashboard-week-summary"
    >
      <div className="absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full bg-[#f4b942] opacity-45" />
      <SectionLabel className="relative mb-2 text-[#7a5200] dark:text-[#f4b942]">
        {current ? "This week, in short" : week.title}
      </SectionLabel>
      <p className={cn(SERIF, "relative m-0 text-xl leading-normal")}>{week.summary || week.title}</p>
      <div className="relative mt-2.5 text-xs text-[#7a5200] dark:text-[#f4b942]">
        {week.title}
        {dayCount > 0 ? ` · from ${dayCount} daily ${dayCount === 1 ? "sheet" : "sheets"}` : ""}
      </div>
    </div>
  );
}

function ComingUp({ events, base }: { events: CalendarEvent[]; base: string }) {
  return (
    <Link
      href={`${base}/calendar`}
      className={cn("block rounded-[22px] border px-5 py-4", SURFACE, LINE)}
      data-testid="card-dashboard-upcoming"
    >
      <SectionLabel className="mb-2.5 text-[#a83818] dark:text-[#e07a52]">Coming up</SectionLabel>
      {events.map((e) => {
        const d = parseLocalDate(e.startDate);
        return (
          <div key={e.id} className="flex items-start gap-3 py-1.5">
            <DateBadge
              tone={DOW_TONES[d.getDay()]}
              top={d.toLocaleDateString(undefined, { month: "short" })}
              num={d.getDate()}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{e.title}</div>
              <div className={cn("text-sm", MUTED)}>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
            </div>
          </div>
        );
      })}
    </Link>
  );
}

function NextWeek({ week }: { week: PersonWeek }) {
  const byDate = new Map<string, string[]>();
  for (const h of week.highlights ?? []) {
    if (h.date) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h.text]);
  }
  const dates = weekdays(week.weekStart);
  const first = parseLocalDate(dates[0]);
  const last = parseLocalDate(dates[4]);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] items-start gap-2" data-testid="dashboard-next-week">
      <div className={cn("pt-2.5 text-sm font-bold", MUTED)}>
        Next week
        <span className="block text-xs font-medium">
          {first.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–{last.getDate()}
        </span>
      </div>
      {dates.map((iso) => {
        const d = parseLocalDate(iso);
        const tone = SATCHEL_TONES[DOW_TONES[d.getDay()]];
        const items = byDate.get(iso) ?? [];
        return (
          <div
            key={iso}
            className={cn(
              "flex min-w-0 flex-col gap-1 self-stretch rounded-[14px] px-3 py-2",
              items.length ? cn(SURFACE, "border-[1.5px] border-[#e3dcc8] dark:border-border") : "border-[1.5px] border-dashed border-[#e3dcc8] dark:border-border",
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className={cn(SERIF, "text-base font-bold", tone.fg)}>{d.getDate()}</span>
              <span className={cn("text-xs font-semibold", tone.fg)}>{WEEKDAY[d.getDay()]}</span>
              {items.length === 0 && <span className={cn("ml-auto text-xs", MUTED)}>Regular day</span>}
            </div>
            {items.map((t, i) => (
              <div key={i} className="text-sm leading-snug">
                {t}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function PersonDashboard({ person }: { person: Person }) {
  const base = `/${encodeURIComponent(person.id)}`;
  const todayIso = useToday();

  // The server lists these reserved schemas by their own date, newest first.
  const days = usePersonDays(person.id, { limit: 30 });
  // Publishers send upcoming weeks too; 52 keeps the current week in the newest-first page.
  const weeks = usePersonWeeks(person.id, { limit: 52 });
  const unread = useMailMessages({ personId: person.id, unreadOnly: true, limit: 50 });
  const latestMail = useMailMessages({ personId: person.id, limit: 1 });
  const photos = useMediaList({ personId: person.id, kind: "image", limit: STRIP_PHOTOS });
  const eventsQuery = useQuery<CalendarEvent[]>({ queryKey: ["/api/calendar/events"] });

  // One sheet per date (records are newest-date first).
  const allDays = useMemo(() => {
    const byDate = new Map<string, PersonDay>();
    for (const r of days.data?.records ?? []) {
      if (r.data?.date && !byDate.has(r.data.date)) byDate.set(r.data.date, r.data);
    }
    return Array.from(byDate.values());
  }, [days.data]);
  const allWeeks = useMemo(
    () => (weeks.data?.records ?? []).map((r) => r.data).filter((w): w is PersonWeek => !!w?.weekStart),
    [weeks.data],
  );
  const currentDay = useMemo(() => pickCurrentDay(allDays, todayIso), [allDays, todayIso]);
  const currentWeek = useMemo(() => pickCurrentWeek(allWeeks, todayIso), [allWeeks, todayIso]);

  const [picked, setPicked] = useState<string | null>(null);
  const day = allDays.find((d) => d.date === picked) ?? currentDay;
  const sheetWeekStart = day ? mondayOfIso(day.date) : null;
  const weekDays = sheetWeekStart
    ? allDays.filter((d) => mondayOfIso(d.date) === sheetWeekStart).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const nextWeekStart = addDaysIso(mondayOfIso(todayIso), 7);
  const nextWeek = allWeeks.find((w) => w.weekStart === nextWeekStart);
  const currentWeekDays = currentWeek ? allDays.filter((d) => mondayOfIso(d.date) === mondayOfIso(currentWeek.weekStart)).length : 0;

  const upcoming = useMemo(
    () =>
      (eventsQuery.data ?? [])
        .filter((e) => e.people?.includes(person.id) && e.endDate >= todayIso)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, UPCOMING_COUNT),
    [eventsQuery.data, person.id, todayIso],
  );

  const unreadCount = unread.data?.emails.length ?? 0;
  const latestSubject = latestMail.data?.emails[0]?.subject;
  const photoItems = photos.data?.items ?? [];

  const loading = days.isLoading || weeks.isLoading || unread.isLoading || photos.isLoading || eventsQuery.isLoading;
  const hasAnything = !!day || !!currentWeek || upcoming.length > 0 || unreadCount > 0 || photoItems.length > 0;

  return (
    <div className="flex flex-col gap-4 px-8 pb-8 pt-6" data-testid="person-dashboard-content">
      <header>
        <div className="text-sm font-semibold text-[#a83818] dark:text-[#e07a52]" data-testid="text-dashboard-date">
          {longDate(parseLocalDate(todayIso))}
        </div>
        <h1 className={cn(SERIF, "mt-1 text-4xl font-bold leading-tight")} data-testid="text-dashboard-title">
          {person.name}'s week
        </h1>
      </header>

      {loading && !hasAnything && <Skeleton className="h-48" data-testid="dashboard-loading" />}

      {!loading && !hasAnything && (
        <EmptyState
          icon={UserRound}
          title={`Nothing here yet for ${person.name}`}
          description="An agent can publish day sheets, emails, photos and events to this person. See docs/person-publishing.md for how."
        />
      )}

      {day && <TodaySheet day={day} days={weekDays} onPick={setPicked} base={base} todayIso={todayIso} />}

      {(currentWeek || upcoming.length > 0) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
          {currentWeek && <WeekInShort
              week={currentWeek}
              dayCount={currentWeekDays}
              current={isCurrentWeek(currentWeek.weekStart, todayIso)}
            />}
          {upcoming.length > 0 && <ComingUp events={upcoming} base={base} />}
        </div>
      )}

      {nextWeek && <NextWeek week={nextWeek} />}

      {(photoItems.length > 0 || unreadCount > 0 || latestSubject) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3.5">
          {photoItems.length > 0 && (
            <Link
              href={`${base}/photos`}
              className={cn("flex min-w-0 items-center gap-3 rounded-[18px] border px-4 py-3", SURFACE, LINE)}
              data-testid="card-dashboard-photos"
            >
              <span className={cn(SERIF, "text-lg font-bold")}>Photos</span>
              <span className={cn("text-sm", MUTED)}>{photos.data?.total ?? photoItems.length}</span>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
                {photoItems.map((m) => (
                  <img
                    key={m.id}
                    src={mediaUrl(m.id)}
                    alt={`Photo of ${person.name}`}
                    loading="lazy"
                    className="h-10 w-10 flex-none rounded-lg bg-muted object-cover"
                  />
                ))}
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-[#a83818] dark:text-[#e07a52]">All →</span>
            </Link>
          )}
          {(unreadCount > 0 || latestSubject) && (
            <Link
              href={`${base}/inbox`}
              className={cn("flex min-w-0 items-center gap-3 rounded-[18px] border px-4 py-3", SURFACE, LINE)}
              data-testid="card-dashboard-inbox"
            >
              <span className={cn(SERIF, "text-lg font-bold")}>Emails</span>
              {unreadCount > 0 && (
                <ToneChip tone="clay" className="text-xs" data-testid="text-dashboard-unread">
                  {unreadCount}
                  {unread.data?.nextBefore ? "+" : ""} to check
                </ToneChip>
              )}
              {latestSubject && <span className="min-w-0 flex-1 truncate text-sm">Latest: {latestSubject}</span>}
              <span className="ml-auto whitespace-nowrap text-sm font-semibold text-[#a83818] dark:text-[#e07a52]">
                Inbox →
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
