import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent, Person, UserSettings } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { CalendarGrid } from "@/pages/calendar";
import { formatDateDisplay, getRelativeDayLabel, parseLocalDate, toISODateString } from "@/lib/format";

const UPCOMING_LIMIT = 10;

export default function PersonCalendar({ person }: { person: Person }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: settings } = useQuery<UserSettings>({ queryKey: ["/api/settings"] });
  const weekStartsMonday = settings?.weekStartsMonday ?? true;

  const { data: allEvents, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
  });
  const { data: people } = useQuery<Person[]>({ queryKey: ["/api/people/list"] });

  const events = useMemo(
    () => (allEvents ?? []).filter((e) => e.people?.includes(person.id)),
    [allEvents, person.id],
  );

  const upcoming = useMemo(() => {
    const today = toISODateString(new Date());
    return events
      .filter((e) => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, UPCOMING_LIMIT);
  }, [events]);

  const shiftMonth = (delta: number) =>
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 md:p-6" data-testid="person-calendar-content">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-xl">
            {currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month" data-testid="person-calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())} data-testid="person-calendar-today">
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month" data-testid="person-calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-[24rem]">
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <CalendarGrid
              currentDate={currentDate}
              events={events}
              onDateClick={setSelectedDate}
              selectedDate={selectedDate}
              people={(people ?? []).filter((p) => p.id === person.id)}
              weekStartsMonday={weekStartsMonday}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-xl">Upcoming</CardTitle>
          <Button variant="outline" asChild>
            <Link href="/calendar" data-testid="person-calendar-open">Open Calendar</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="No upcoming events"
              description={`Events that include ${person.name} will appear here.`}
            />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((e) => {
                const start = parseLocalDate(e.startDate);
                return (
                  <li key={e.id} className="flex flex-col" data-testid={`person-calendar-event-${e.id}`}>
                    <span className="font-medium text-foreground">{e.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {e.startDate <= toISODateString(new Date()) ? "Today" : getRelativeDayLabel(start)} · {formatDateDisplay(start)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
