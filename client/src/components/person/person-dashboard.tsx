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
import { formatDateDisplay, getRelativeDayLabel, parseLocalDate, toISODateString } from "@/lib/format";

const UPCOMING_COUNT = 5;
const UNREAD_SUBJECTS = 3;
const PHOTO_COUNT = 6;

function CardLink({
  href,
  testId,
  title,
  children,
}: {
  href: string;
  testId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" data-testid={testId}>
      <Card className="h-full hover-elevate">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Link>
  );
}

export default function PersonDashboard({ person }: { person: Person }) {
  const base = `/${encodeURIComponent(person.id)}`;
  const todayIso = toISODateString(new Date());

  const days = usePersonDays(person.id, { limit: 30 });
  const weeks = usePersonWeeks(person.id, { limit: 10 });
  const unread = useMailMessages({ personId: person.id, unreadOnly: true, limit: 50 });
  const photos = useMediaList({ personId: person.id, kind: "image", limit: PHOTO_COUNT });
  const eventsQuery = useQuery<CalendarEvent[]>({ queryKey: ["/api/calendar/events"] });

  const latestDay = useMemo(() => {
    const records = days.data?.records ?? [];
    return records.map((r) => r.data).sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [days.data]);

  const latestWeek = useMemo(() => {
    const records = weeks.data?.records ?? [];
    return records.map((r) => r.data).sort((a, b) => (b.weekStart ?? "").localeCompare(a.weekStart ?? ""))[0];
  }, [weeks.data]);

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
  const hasAnything =
    !!latestDay || !!latestWeek || upcoming.length > 0 || unreadCount > 0 || photoItems.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="person-dashboard-content">
      <header>
        <h2 className="text-2xl font-semibold" data-testid="text-dashboard-title">
          {person.name}'s week
        </h2>
        <p className="text-muted-foreground" data-testid="text-dashboard-date">
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

      {latestWeek && (
        <section
          className="rounded-xl border bg-card p-4 md:p-6 space-y-1"
          data-testid="dashboard-week-summary"
        >
          <h3 className="text-lg font-semibold">{latestWeek.title}</h3>
          {latestWeek.summary && (
            <p className="text-foreground whitespace-pre-line">{latestWeek.summary}</p>
          )}
        </section>
      )}

      {latestDay && (
        <section className="space-y-3" data-testid="dashboard-sheet">
          <Link
            href={`${base}/sheets`}
            className="inline-block text-xl font-semibold hover:underline"
            data-testid="link-dashboard-sheets"
          >
            {latestDay.date === todayIso ? "Today's sheet" : "Latest sheet"}
          </Link>
          <DaySheetCard day={latestDay} personName={person.name} compact />
          <DayTimeline timeline={latestDay.timeline} personName={person.name} />
        </section>
      )}

      {(upcoming.length > 0 || unreadCount > 0 || photoItems.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {upcoming.length > 0 && (
            <CardLink href={`${base}/calendar`} testId="card-dashboard-upcoming" title="Upcoming">
              <ul className="space-y-2">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex flex-col">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {getRelativeDayLabel(parseLocalDate(e.startDate))}
                    </span>
                  </li>
                ))}
              </ul>
            </CardLink>
          )}
          {unreadCount > 0 && (
            <CardLink href={`${base}/inbox`} testId="card-dashboard-inbox" title="Inbox">
              <p className="text-sm text-muted-foreground mb-2" data-testid="text-dashboard-unread">
                {unreadCount}
                {unread.data?.nextBefore ? "+" : ""} unread
              </p>
              <ul className="space-y-1">
                {unreadEmails.slice(0, UNREAD_SUBJECTS).map((m) => (
                  <li key={m.id} className="truncate font-medium">
                    {m.subject || "(no subject)"}
                  </li>
                ))}
              </ul>
            </CardLink>
          )}
          {photoItems.length > 0 && (
            <CardLink href={`${base}/photos`} testId="card-dashboard-photos" title="Photos">
              <div className="grid grid-cols-3 gap-2">
                {photoItems.map((m) => (
                  <img
                    key={m.id}
                    src={mediaUrl(m.id)}
                    alt={`Photo of ${person.name}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ))}
              </div>
            </CardLink>
          )}
        </div>
      )}
    </div>
  );
}
