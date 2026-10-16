import { useEffect, useMemo, useRef, useState } from "react";
import { Cake, ChevronLeft, ChevronRight, Clock, MapPin, Plus, StickyNote, Users } from "lucide-react";
import type { CalendarEvent, Person } from "@shared/schema";
import { EventType } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatHourLabel, formatTimeOfDay, layoutCalendarDay, type TimedDayEntry } from "@/lib/calendar-day";
import { addDaysIso } from "@/lib/person-day";

const HOUR_PX = 56;
const MIN_BLOCK_PX = 24;
const LABEL_COL_PX = 56;

export interface CalendarDayViewProps {
  dayIso: string;
  todayIso: string;
  events: CalendarEvent[];
  people: Person[];
  timeFormat: "12h" | "24h";
  onNavigate(dayIso: string): void;
  onBack(): void;
  onSelectEvent(event: CalendarEvent): void;
  onCreateAt(dayIso: string, startTime?: string): void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToHhmm(min: number): string {
  return `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
}

function longDateTitle(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function personNames(event: CalendarEvent, people: Person[]): string[] {
  const ids = event.people || [];
  return people.filter((p) => ids.includes(p.id)).map((p) => p.name);
}

function timeRange(event: CalendarEvent, timeFormat: "12h" | "24h"): string {
  if (!event.startTime) return "All day";
  const start = formatTimeOfDay(event.startTime, timeFormat);
  return event.endTime ? `${start} - ${formatTimeOfDay(event.endTime, timeFormat)}` : start;
}

export function CalendarDayView({
  dayIso,
  todayIso,
  events,
  people,
  timeFormat,
  onNavigate,
  onBack,
  onSelectEvent,
  onCreateAt,
}: CalendarDayViewProps) {
  const layout = useMemo(() => layoutCalendarDay(events, people, dayIso), [events, people, dayIso]);
  const { allDay, birthdays, timed, startHour, endHour } = layout;
  const isToday = dayIso === todayIso;

  const [nowMin, setNowMin] = useState(nowMinutes);
  useEffect(() => {
    if (!isToday) return;
    setNowMin(nowMinutes());
    const timer = setInterval(() => setNowMin(nowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, [isToday]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const firstStartMin = timed.length > 0 ? timed[0].startMin : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchorMin = isToday ? nowMinutes() : firstStartMin;
    if (anchorMin === null) {
      el.scrollTop = 0;
      return;
    }
    el.scrollTop = Math.max(0, ((anchorMin - startHour * 60) / 60) * HOUR_PX - HOUR_PX);
    // Re-anchor only when the day changes, not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIso]);

  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const nowTop = ((nowMin - startHour * 60) / 60) * HOUR_PX;
  const showNow = isToday && nowTop >= 0 && nowTop <= gridHeight;

  const planItems = [
    ...allDay.map((event) => ({ event, sortMin: -1 })),
    ...timed.map((t) => ({ event: t.event, sortMin: t.startMin })),
  ];

  const blockStyle = (t: TimedDayEntry) => ({
    top: ((t.startMin - startHour * 60) / 60) * HOUR_PX,
    height: Math.max(MIN_BLOCK_PX, ((t.endMin - t.startMin) / 60) * HOUR_PX),
    left: `${(t.column / t.columns) * 100}%`,
    width: `${100 / t.columns}%`,
  });

  return (
    <div className="flex flex-col gap-4 min-h-0" data-testid="calendar-day-view">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack} data-testid="button-day-back">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Month
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => onNavigate(addDaysIso(dayIso, -1))}
          data-testid="button-prev-day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => onNavigate(addDaysIso(dayIso, 1))}
          data-testid="button-next-day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday && (
          <Button variant="outline" size="sm" onClick={() => onNavigate(todayIso)} data-testid="button-day-today">
            Today
          </Button>
        )}
        <h2 className="text-xl font-semibold flex-1 min-w-0" data-testid="text-day-title">
          {longDateTitle(dayIso)}
        </h2>
        <Button size="sm" onClick={() => onCreateAt(dayIso)} data-testid="button-day-new-event">
          <Plus className="h-4 w-4 mr-1" />
          New Event
        </Button>
      </div>

      {(allDay.length > 0 || birthdays.length > 0) && (
        <div className="flex flex-wrap items-center gap-2" data-testid="day-all-day">
          <span className="text-xs font-medium text-muted-foreground">All day</span>
          {birthdays.map((p) => (
            <span
              key={`bday-${p.id}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
              data-testid={`day-birthday-${p.id}`}
            >
              <Cake className="h-3 w-3" />
              {p.name}
            </span>
          ))}
          {allDay.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event)}
              className={cn(
                "inline-flex items-center rounded-md px-2 py-1 text-sm border-l-2",
                event.type === EventType.SHARED
                  ? "border-l-cyan-500 bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100"
                  : "border-l-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
                event.cancelled && "line-through",
              )}
              data-testid={`day-event-${event.id}`}
            >
              {event.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-0">
        <Card className="flex-1 min-w-0 p-0 overflow-hidden">
          <div ref={scrollRef} className="max-h-[70vh] min-h-0 overflow-y-auto" data-testid="day-grid">
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((h, i) => {
                const hh = pad2(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onCreateAt(dayIso, `${hh}:00`)}
                    aria-label={`New event at ${hh}:00`}
                    className="absolute left-0 right-0 flex items-start text-left border-t border-border hover:bg-muted/40"
                    style={{ top: i * HOUR_PX, height: HOUR_PX }}
                    data-testid={`day-slot-${hh}`}
                  >
                    <span
                      className="text-xs text-muted-foreground pt-1 pr-2 text-right"
                      style={{ width: LABEL_COL_PX }}
                    >
                      {formatHourLabel(h, timeFormat)}
                    </span>
                  </button>
                );
              })}
              <div
                className="absolute top-0 bottom-0 right-0 pointer-events-none"
                style={{ left: LABEL_COL_PX }}
              >
                {timed.map((t) => {
                  const { event } = t;
                  const names = personNames(event, people);
                  return (
                    <div key={event.id} className="absolute px-0.5" style={blockStyle(t)}>
                      <button
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className={cn(
                          "pointer-events-auto h-full w-full overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs",
                          event.type === EventType.SHARED
                            ? "border-l-cyan-500 bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100"
                            : "border-l-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
                        )}
                        data-testid={`day-event-${event.id}`}
                      >
                        <div className={cn("font-medium truncate", event.cancelled && "line-through")}>{event.title}</div>
                        <div className="truncate">{timeRange(event, timeFormat)}</div>
                        {event.location && <div className="truncate">{event.location}</div>}
                        {names.length > 0 && <div className="truncate">{names.join(", ")}</div>}
                      </button>
                    </div>
                  );
                })}
              </div>
              {showNow && (
                <div
                  className="absolute right-0 h-0.5 bg-red-500 pointer-events-none"
                  style={{ top: nowTop, left: LABEL_COL_PX }}
                  data-testid="day-now-line"
                >
                  <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:w-80 lg:flex-shrink-0 p-4 flex flex-col gap-3" data-testid="day-plan">
          <h3 className="font-semibold">Day plan</h3>
          {planItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing planned yet - tap an hour to add an event</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {planItems
                .sort((a, b) => a.sortMin - b.sortMin)
                .map(({ event }) => {
                  const names = personNames(event, people);
                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2 border-l-2",
                        event.type === EventType.SHARED ? "border-l-cyan-500" : "border-l-violet-500",
                      )}
                      data-testid={`day-plan-item-${event.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", event.cancelled && "line-through")}>{event.title}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                          {event.type === EventType.SHARED ? "Shared" : "Private"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{timeRange(event, timeFormat)}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {names.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3 flex-shrink-0" />
                          <span>{names.join(", ")}</span>
                        </div>
                      )}
                      {event.notes && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground">
                          <StickyNote className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="whitespace-pre-wrap">{event.notes}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
