import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LINE, MUTED, SERIF, SURFACE, ToneChip } from "@/components/person/satchel";
import { EventsDayCard } from "@/components/events/events-day-card";
import { dayStrip, dayViewSections } from "@/lib/events-day";
import { tripBadge, type EventItem } from "@/lib/events";
import { addDaysIso, weekdayOfIso } from "@/lib/person-day";
import { cn } from "@/lib/utils";

interface EventsDayViewProps {
  items: EventItem[];
  trips: EventItem[];
  dateIso: string;
  todayIso: string;
  isDayShown?: (iso: string) => boolean;
  onDateChange: (iso: string) => void;
}

const NAV = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border";
const GRID = "grid gap-2 lg:grid-cols-2 xl:grid-cols-3";
const H3 = "text-sm font-bold uppercase tracking-wide text-[#5d5648] dark:text-muted-foreground";

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function headingFor(iso: string): string {
  return utcDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekdayShort(iso: string): string {
  return utcDate(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function TripCard({ item }: { item: EventItem }) {
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      className={cn("block min-h-16 space-y-1 rounded-2xl border p-3", SURFACE, LINE)}
      data-testid={`events-day-trip-${item.eventId}`}
    >
      <div className={cn(SERIF, "line-clamp-2 text-base font-bold leading-snug text-[#1a1612] dark:text-foreground")}>
        {item.event.title}
      </div>
      <ToneChip tone="leaf">{tripBadge(item)}</ToneChip>
      {item.event.summary && <p className={cn("line-clamp-3 text-sm", MUTED)}>{item.event.summary}</p>}
    </Link>
  );
}

export function EventsDayView({ items, trips, dateIso, todayIso, isDayShown, onDateChange }: EventsDayViewProps) {
  const shown = !isDayShown || isDayShown(dateIso);
  const sections = useMemo(() => (shown ? dayViewSections(items, dateIso) : []), [items, dateIso, shown]);
  const strip = useMemo(() => dayStrip(items, dateIso, todayIso), [items, dateIso, todayIso]);
  const total = sections.reduce((n, s) => n + s.entries.length, 0);
  const weekday = weekdayOfIso(dateIso);
  const showTrips = shown && (weekday === 0 || weekday === 6) && trips.length > 0;

  return (
    <section className="space-y-4" aria-label="Day view" data-testid="events-day-view">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={cn(NAV, SURFACE, LINE)}
          onClick={() => onDateChange(addDaysIso(dateIso, -1))}
          aria-label="Previous day"
          data-testid="events-day-view-prev"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <h2
            className={cn(SERIF, "text-2xl font-bold text-[#1a1612] dark:text-foreground")}
            data-testid="events-day-view-title"
          >
            {headingFor(dateIso)}
          </h2>
          <p className={cn("text-sm", MUTED)} data-testid="events-day-view-count">
            {total} {total === 1 ? "event" : "events"}
          </p>
          {dateIso !== todayIso && (
            <button
              type="button"
              className="mt-1 min-h-11 rounded-full border px-4 text-base font-semibold"
              onClick={() => onDateChange(todayIso)}
              data-testid="events-day-view-today"
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          className={cn(NAV, SURFACE, LINE)}
          onClick={() => onDateChange(addDaysIso(dateIso, 1))}
          aria-label="Next day"
          data-testid="events-day-view-next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </header>

      <nav className="grid grid-cols-7 gap-1.5" aria-label="Next days" data-testid="events-day-strip">
        {strip.map((day) => {
          const selected = day.iso === dateIso;
          return (
            <button
              key={day.iso}
              type="button"
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-2xl border px-1 py-1.5",
                selected ? "bg-[#f3e1b5] text-[#6b4e0a] dark:bg-[#f4d06f]/20 dark:text-[#f4d06f]" : SURFACE,
                LINE,
              )}
              aria-current={selected ? "date" : undefined}
              onClick={() => onDateChange(day.iso)}
              data-testid={`events-day-strip-${day.iso}`}
            >
              <span className="text-xs font-semibold uppercase">{weekdayShort(day.iso)}</span>
              <span className={cn(SERIF, "text-lg font-bold leading-none")}>{Number(day.iso.slice(8))}</span>
              <span className="text-xs">{day.count}</span>
            </button>
          );
        })}
      </nav>

      {total === 0 && (
        <p className={cn("text-base", MUTED)} data-testid="events-day-view-empty">
          Nothing planned for this day.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.key} className="space-y-1.5" data-testid={`events-day-section-${section.key}`}>
          <h3 className={H3}>{section.title}</h3>
          <div className={GRID}>
            {section.entries.map((entry) => (
              <EventsDayCard key={`${entry.item.eventId}-${entry.window.open}`} entry={entry} />
            ))}
          </div>
        </div>
      ))}

      {showTrips && (
        <div className="space-y-1.5" data-testid="events-day-view-trips">
          <h3 className={H3}>Trip ideas for any weekend</h3>
          <div className={GRID}>
            {trips.map((item) => (
              <TripCard key={item.eventId} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
