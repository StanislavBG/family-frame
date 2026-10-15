import { useMemo } from "react";
import { Link } from "wouter";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { DEFAULT_VISIT_PREFS, suggestVisit, type VisitPrefs } from "@shared/events-visit";
import { LINE, MUTED, SERIF, SURFACE, ToneChip } from "@/components/person/satchel";
import {
  CATEGORY_META,
  eventDayEntries,
  formatClockRange,
  formatWhere,
  useEventPreferences,
  type DayEntry,
  type EventItem,
} from "@/lib/events";
import { addDaysIso } from "@/lib/person-day";
import { cn } from "@/lib/utils";

interface EventsDayPanelProps {
  items: EventItem[];
  dateIso: string;
  onDateChange: (iso: string) => void;
}

const NAV = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border";

function headingFor(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Row({ entry, children }: { entry: DayEntry<EventItem>; children: React.ReactNode }) {
  const { item } = entry;
  const { event } = item;
  const cat = CATEGORY_META[event.category];
  const km = item.rec.distanceKm;
  const where = formatWhere(event.location);
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      className={cn("block min-h-11 space-y-0.5 rounded-2xl border p-2.5", SURFACE, LINE)}
      data-testid={`events-day-row-${item.eventId}`}
    >
      {children}
      <div className="flex items-center gap-1.5">
        {item.response === "going" && <Check className="h-4 w-4 shrink-0" aria-label="Going" />}
        {item.response === "interested" && <Star className="h-4 w-4 shrink-0" aria-label="Interested" />}
        <span
          className={cn(
            SERIF,
            "min-w-0 flex-1 text-base font-bold leading-snug text-[#1a1612] dark:text-foreground",
            event.status === "cancelled" && "line-through",
          )}
        >
          {event.title}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ToneChip tone={cat.tone}>{cat.label}</ToneChip>
        {(where || km !== undefined) && (
          <span className={cn("text-sm", MUTED)}>
            {where}
            {where && km !== undefined && " · "}
            {km !== undefined && `${km.toFixed(1)} km`}
          </span>
        )}
      </div>
    </Link>
  );
}

export function EventsDayPanel({ items, dateIso, onDateChange }: EventsDayPanelProps) {
  const { data: prefs } = useEventPreferences();
  const { sessions, open } = useMemo(() => eventDayEntries(items, dateIso), [items, dateIso]);
  const visitPrefs: VisitPrefs = prefs
    ? {
        visitBlockMinutes: prefs.visitBlockMinutes,
        visitEarliest: prefs.visitEarliest,
        visitLatestEnd: prefs.visitLatestEnd,
        preferredTimes: prefs.preferredTimes,
      }
    : DEFAULT_VISIT_PREFS;
  const total = sessions.length + open.length;

  return (
    <section
      className={cn("space-y-3 rounded-3xl border p-4", SURFACE, LINE)}
      aria-label="Day events"
      data-testid="events-day-panel"
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={cn(NAV, SURFACE, LINE)}
          onClick={() => onDateChange(addDaysIso(dateIso, -1))}
          aria-label="Previous day"
          data-testid="events-day-prev"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <h2 className={cn(SERIF, "text-xl font-bold text-[#1a1612] dark:text-foreground")} data-testid="events-day-title">
            {headingFor(dateIso)}
          </h2>
          <p className={cn("text-sm", MUTED)} data-testid="events-day-count">
            {total} {total === 1 ? "event" : "events"}
          </p>
        </div>
        <button
          type="button"
          className={cn(NAV, SURFACE, LINE)}
          onClick={() => onDateChange(addDaysIso(dateIso, 1))}
          aria-label="Next day"
          data-testid="events-day-next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </header>

      {total === 0 && (
        <p className={cn("text-base", MUTED)} data-testid="events-day-empty">
          Nothing planned for this day.
        </p>
      )}

      {sessions.length > 0 && (
        <div className="space-y-1.5" data-testid="events-day-sessions">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#5d5648] dark:text-muted-foreground">
            At set times
          </h3>
          {sessions.map((entry) => (
            <Row key={`${entry.item.eventId}-${entry.window.open}`} entry={entry}>
              <div className="text-sm font-semibold text-[#1a1612] dark:text-foreground">
                {formatClockRange(entry.window.open, entry.window.close)}
              </div>
            </Row>
          ))}
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-1.5" data-testid="events-day-open">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#5d5648] dark:text-muted-foreground">
            Open all day
          </h3>
          {open.map((entry) => {
            const { window } = entry;
            const block = suggestVisit(window, visitPrefs);
            return (
              <Row key={entry.item.eventId} entry={entry}>
                <div className="text-sm font-semibold text-[#1a1612] dark:text-foreground">
                  {window.hoursKnown ? formatClockRange(window.open, window.close) : "Hours not listed"}
                </div>
                <div className={cn("text-sm", MUTED)}>
                  Suggested visit {formatClockRange(block.start, block.end)}
                </div>
              </Row>
            );
          })}
        </div>
      )}
    </section>
  );
}
