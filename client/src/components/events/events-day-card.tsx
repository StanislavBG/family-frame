import { Link } from "wouter";
import { MapPin, Star } from "lucide-react";
import { isOngoingClass, signUpUrl } from "@shared/events-activity";
import { DEFAULT_VISIT_PREFS, suggestVisit, type VisitPrefs } from "@shared/events-visit";
import { LINE, MUTED, SERIF, SURFACE, ToneChip } from "@/components/person/satchel";
import {
  CATEGORY_META,
  formatClockRange,
  formatCost,
  formatWhere,
  useEventPreferences,
  useRespond,
  type DayEntry,
  type EventItem,
} from "@/lib/events";
import { hasMapLocation, mapUrl } from "@/lib/event-detail";
import { cn } from "@/lib/utils";

const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-base font-semibold";
const MAP_LINK = cn(
  ACTION,
  "border-transparent bg-[#dde8f1] text-[#3d6a8f] dark:bg-[#8fb4d4]/15 dark:text-[#8fb4d4]",
);
const PRESSED = "bg-[#f3e1b5] text-[#6b4e0a] dark:bg-[#f4d06f]/20 dark:text-[#f4d06f]";

/** The time line for a day entry: set time, hours, or the class's recurrence text. */
export function dayCardTimeLine(entry: DayEntry<EventItem>, visitPrefs: VisitPrefs): { when: string; visit?: string } {
  const { event } = entry.item;
  const { window } = entry;
  if (window.kind === "session") return { when: formatClockRange(window.open, window.close) };
  if (isOngoingClass(event)) {
    return { when: event.schedule.recurrenceText?.trim() || "See the class website for times" };
  }
  const block = suggestVisit(window, visitPrefs);
  return {
    when: window.hoursKnown ? formatClockRange(window.open, window.close) : "Hours not listed",
    visit: `Suggested visit ${formatClockRange(block.start, block.end)}`,
  };
}

export function EventsDayCard({ entry }: { entry: DayEntry<EventItem> }) {
  const { item } = entry;
  const { event } = item;
  const { data: prefs } = useEventPreferences();
  const respond = useRespond(item.eventId);
  const visitPrefs: VisitPrefs = prefs
    ? {
        visitBlockMinutes: prefs.visitBlockMinutes,
        visitEarliest: prefs.visitEarliest,
        visitLatestEnd: prefs.visitLatestEnd,
        preferredTimes: prefs.preferredTimes,
      }
    : DEFAULT_VISIT_PREFS;
  const cat = CATEGORY_META[event.category];
  const km = item.rec.distanceKm;
  const where = formatWhere(event.location);
  const { when, visit } = dayCardTimeLine(entry, visitPrefs);
  const url = signUpUrl(event);
  const interested = item.response === "interested";
  const going = item.response === "going";
  const id = item.eventId;

  return (
    <article
      className={cn("space-y-2 rounded-2xl border p-3", SURFACE, LINE)}
      data-testid={`events-day-card-${id}`}
    >
      <div className="text-sm font-semibold text-[#1a1612] dark:text-foreground" data-testid={`events-day-card-time-${id}`}>
        {when}
        {visit && <span className={cn("block font-normal", MUTED)}>{visit}</span>}
      </div>
      <Link
        href={`/${encodeURIComponent(id)}`}
        className={cn(
          SERIF,
          "block min-h-11 text-lg font-bold leading-snug text-[#1a1612] dark:text-foreground",
          event.status === "cancelled" && "line-through",
        )}
      >
        {event.title}
      </Link>
      {event.summary && <p className={cn("text-base", MUTED)}>{event.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ToneChip tone={cat.tone}>{cat.label}</ToneChip>
        {item.closeToHome === true && <ToneChip tone="leaf">Close to home</ToneChip>}
        <span className={cn("text-sm", MUTED)} data-testid={`events-day-card-cost-${id}`}>
          {formatCost(event.cost)}
        </span>
      </div>
      {(where || km !== undefined) && (
        <p className={cn("text-sm", MUTED)}>
          {where}
          {where && km !== undefined && " · "}
          {km !== undefined && `${km.toFixed(1)} km`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(ACTION, SURFACE, LINE, interested && PRESSED)}
          aria-pressed={interested}
          disabled={going || respond.isPending}
          onClick={() => respond.mutate({ response: "interested", addToCalendar: false })}
          data-testid={`events-day-card-interested-${id}`}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          Interested
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(ACTION, LINE)}
            data-testid={`events-day-card-signup-${id}`}
          >
            Sign up
          </a>
        )}
        {hasMapLocation(event.location) && (
          <a
            href={mapUrl(event.location)}
            target="_blank"
            rel="noopener noreferrer"
            className={MAP_LINK}
            aria-label={`Open ${event.location.venueName || event.title} in Google Maps`}
            data-testid={`events-day-card-map-${id}`}
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Map
          </a>
        )}
      </div>
    </article>
  );
}
