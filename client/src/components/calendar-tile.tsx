import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CalendarEvent, UserSettings } from "@shared/schema";
import { EventType } from "@shared/schema";

interface CalendarTileProps {
  className?: string;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function MiniCalendarGrid({
  now,
  events,
  weekStartsMonday,
}: {
  now: Date;
  events: CalendarEvent[];
  weekStartsMonday: boolean;
}) {
  const year = now.getFullYear();
  const month = now.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = firstDayOfMonth.getDay();

  const startingDay = weekStartsMonday
    ? firstDayIndex === 0
      ? 6
      : firstDayIndex - 1
    : firstDayIndex;

  const weekDays = weekStartsMonday
    ? ["M", "T", "W", "T", "F", "S", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  const days: (number | null)[] = [];
  for (let i = 0; i < startingDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const today = now.getDate();

  const hasEventOnDay = (day: number) => {
    const date = new Date(year, month, day);
    return events.some((event) => {
      const start = parseLocalDate(event.startDate);
      const end = parseLocalDate(event.endDate);
      return date >= start && date <= end;
    });
  };

  return (
    <div className="w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0 mb-0.5">
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={cn(
              "text-center text-[9px] md:text-[10px] font-semibold leading-tight",
              (weekStartsMonday ? i >= 5 : i === 0 || i === 6)
                ? "text-muted-foreground/60"
                : "text-muted-foreground"
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0">
        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const isToday = day === today;
          const hasEvent = hasEventOnDay(day);

          return (
            <div
              key={day}
              className="flex flex-col items-center justify-center aspect-square relative"
            >
              <span
                className={cn(
                  "text-[10px] md:text-xs leading-none font-medium flex items-center justify-center rounded-full",
                  isToday
                    ? "bg-primary text-primary-foreground w-5 h-5 md:w-6 md:h-6"
                    : "text-foreground"
                )}
              >
                {day}
              </span>
              {hasEvent && !isToday && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-primary/70" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingEventsList({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = events
    .filter((e) => parseLocalDate(e.endDate) >= today)
    .sort(
      (a, b) =>
        parseLocalDate(a.startDate).getTime() -
        parseLocalDate(b.startDate).getTime()
    )
    .slice(0, 3);

  if (upcoming.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-1">No upcoming events</div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {upcoming.map((event) => {
        const start = parseLocalDate(event.startDate);
        const diffDays = Math.ceil(
          (start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const dateLabel =
          diffDays === 0
            ? "Today"
            : diffDays === 1
              ? "Tomorrow"
              : start.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });

        return (
          <div key={event.id} className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                event.type === EventType.SHARED
                  ? "bg-cyan-500"
                  : "bg-violet-500"
              )}
            />
            <span className="text-[10px] md:text-xs font-medium truncate flex-1">
              {event.title}
            </span>
            <span className="text-[10px] md:text-xs text-muted-foreground flex-shrink-0">
              {dateLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarTile({ className = "" }: CalendarTileProps) {
  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
    staleTime: 60 * 1000,
  });

  const weekStartsMonday = settings?.weekStartsMonday ?? true;
  const now = new Date();
  const monthName = now.toLocaleDateString(undefined, { month: "long" });

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-3 p-4", className)}>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col h-full w-full p-4 md:p-5", className)}
      data-testid="calendar-tile"
    >
      {/* Month name header */}
      <div className="text-base md:text-lg font-bold text-primary leading-tight">
        {monthName}
      </div>

      {/* Mini calendar grid */}
      <div className="mt-2 flex-1 min-h-0">
        <MiniCalendarGrid
          now={now}
          events={events || []}
          weekStartsMonday={weekStartsMonday}
        />
      </div>

      {/* Upcoming events */}
      <div className="border-t border-border/40 pt-2 mt-2">
        <UpcomingEventsList events={events || []} />
      </div>
    </div>
  );
}
