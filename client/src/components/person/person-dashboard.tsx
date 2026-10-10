import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { UserRound } from "lucide-react";
import type { CalendarEvent, Person } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { DaySheetCard, DayTimeline } from "@/components/person/person-day-sheet";
import {
  mediaUrl,
  useMailMessages,
  useMediaList,
  usePersonDays,
  usePersonWeeks,
} from "@/lib/agent-data";
import { pickCurrentDay, pickCurrentWeek } from "@/lib/person-day";
import { formatDateDisplay, getRelativeDayLabel, parseLocalDate, toISODateString } from "@/lib/format";
import { cn } from "@/lib/utils";

// Sized so the whole Dashboard fits one wall screen without scrolling.
const UPCOMING_COUNT = 3;
const UNREAD_SUBJECTS = 2;
const PHOTO_COUNT = 6;

function CardLink({
  href,
  testId,
  title,
  className,
  contentClassName,
  children,
}: {
  href: string;
  testId: string;
  title: string;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn("block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring", className)}
      data-testid={testId}
    >
      <Card className="h-full flex flex-col hover-elevate">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className={cn("p-4 pt-0", contentClassName)}>{children}</CardContent>
      </Card>
    </Link>
  );
}

export default function PersonDashboard({ person }: { person: Person }) {
  const base = `/${encodeURIComponent(person.id)}`;
  const todayIso = toISODateString(new Date());

  // The server lists these reserved schemas by their own date, newest first.
  const days = usePersonDays(person.id, { limit: 30 });
  const weeks = usePersonWeeks(person.id, { limit: 10 });
  const unread = useMailMessages({ personId: person.id, unreadOnly: true, limit: 50 });
  const photos = useMediaList({ personId: person.id, kind: "image", limit: PHOTO_COUNT });
  const eventsQuery = useQuery<CalendarEvent[]>({ queryKey: ["/api/calendar/events"] });

  const latestDay = useMemo(
    () => pickCurrentDay((days.data?.records ?? []).map((r) => r.data).filter((d) => !!d?.date), todayIso),
    [days.data, todayIso],
  );

  const currentWeek = useMemo(
    () => pickCurrentWeek((weeks.data?.records ?? []).map((r) => r.data).filter((w) => !!w?.weekStart), todayIso),
    [weeks.data, todayIso],
  );

  const upcoming = useMemo(
    () =>
      (eventsQuery.data ?? [])
        .filter((e) => e.people?.includes(person.id) && e.endDate >= todayIso)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, UPCOMING_COUNT),
    [eventsQuery.data, todayIso],
  );

  const unreadEmails = unread.data?.emails ?? [];
  const unreadCount = unreadEmails.length;
  const photoItems = (photos.data?.items ?? []).slice(0, PHOTO_COUNT);

  const loading =
    days.isLoading || weeks.isLoading || unread.isLoading || photos.isLoading || eventsQuery.isLoading;
  const hasMain = !!latestDay || !!currentWeek;
  const hasSide = upcoming.length > 0 || unreadCount > 0 || photoItems.length > 0;
  const hasAnything = hasMain || hasSide;

  return (
    <div className="flex flex-col gap-4 p-4 lg:h-full lg:overflow-hidden" data-testid="person-dashboard-content">
      <header className="flex flex-wrap items-baseline gap-x-4">
        <h2 className="text-2xl font-semibold" data-testid="text-dashboard-title">
          {person.name}'s week
        </h2>
        <p className="text-lg text-muted-foreground" data-testid="text-dashboard-date">
          {formatDateDisplay(new Date())}
        </p>
      </header>

      {loading && !hasAnything && <Skeleton className="h-48" data-testid="dashboard-loading" />}

      {!loading && !hasAnything && (
        <EmptyState
          icon={UserRound}
          title={`Nothing here yet for ${person.name}`}
          description="An agent can publish day sheets, emails, photos and events to this person. See docs/person-publishing.md for how."
        />
      )}

      {hasAnything && (
        <div
          className={cn("grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1", hasMain && hasSide && "lg:grid-cols-3")}
        >
          {hasMain && (
            <div className="flex flex-col gap-4 lg:col-span-2 lg:min-h-0">
              {currentWeek && (
                <section className="rounded-xl border bg-card px-4 py-3" data-testid="dashboard-week-summary">
                  <h3 className="text-xl font-semibold">{currentWeek.title}</h3>
                  {currentWeek.summary && (
                    <p className="text-lg line-clamp-2">{currentWeek.summary}</p>
                  )}
                </section>
              )}

              {latestDay && (
                <section className="flex flex-col gap-2" data-testid="dashboard-sheet">
                  <Link
                    href={`${base}/sheets`}
                    className="self-start text-xl font-semibold underline-offset-4 hover:underline"
                    data-testid="link-dashboard-sheets"
                  >
                    {latestDay.date === todayIso ? "Today's sheet" : "Latest sheet"}
                  </Link>
                  <DaySheetCard day={latestDay} personName={person.name} compact />
                  <DayTimeline
                    timeline={latestDay.timeline}
                    personName={person.name}
                    date={latestDay.date}
                    source={latestDay.source}
                    compact
                  />
                </section>
              )}
            </div>
          )}

          {hasSide && (
            <div className="flex flex-col gap-4 lg:min-h-0">
              {upcoming.length > 0 && (
                <CardLink href={`${base}/calendar`} testId="card-dashboard-upcoming" title="Next up">
                  <ul className="space-y-2">
                    {upcoming.map((e, i) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-3">
                        <span className={cn("truncate font-medium", i === 0 ? "text-xl" : "text-lg")}>
                          {e.title}
                        </span>
                        <span className="shrink-0 text-base text-muted-foreground">
                          {getRelativeDayLabel(parseLocalDate(e.startDate))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardLink>
              )}
              {unreadCount > 0 && (
                <CardLink href={`${base}/inbox`} testId="card-dashboard-inbox" title="Inbox">
                  <p className="text-lg text-muted-foreground" data-testid="text-dashboard-unread">
                    <span className="text-2xl font-semibold text-foreground">
                      {unreadCount}
                      {unread.data?.nextBefore ? "+" : ""}
                    </span>{" "}
                    unread
                  </p>
                  <ul>
                    {unreadEmails.slice(0, UNREAD_SUBJECTS).map((m) => (
                      <li key={m.id} className="truncate text-lg">
                        {m.subject || "(no subject)"}
                      </li>
                    ))}
                  </ul>
                </CardLink>
              )}
              {photoItems.length > 0 && (
                <CardLink
                  href={`${base}/photos`}
                  testId="card-dashboard-photos"
                  title="Photos"
                  className="lg:min-h-0 lg:flex-1"
                  contentClassName="lg:min-h-0 lg:flex-1"
                >
                  <div className="grid grid-cols-3 gap-2 lg:h-full lg:auto-rows-fr">
                    {photoItems.map((m) => (
                      <img
                        key={m.id}
                        src={mediaUrl(m.id)}
                        alt={`Photo of ${person.name}`}
                        loading="lazy"
                        className="aspect-square w-full rounded-md bg-muted object-cover lg:aspect-auto lg:h-full lg:min-h-0"
                      />
                    ))}
                  </div>
                </CardLink>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
