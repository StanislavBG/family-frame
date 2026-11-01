import { useEffect, useMemo, useRef } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import { CalendarDays, CalendarRange, CalendarHeart, Hourglass, List, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Person } from "@shared/schema";
import { ageOn, isOngoingClass, isSignUpActivity } from "@shared/events-activity";
import { dayWindows } from "@shared/events-visit";
import type { FfEvent } from "@shared/events";
import { CLOSE_TO_HOME_MILES } from "@shared/events-proximity";
import { EmptyState } from "@/components/empty-state";
import { EventHero } from "@/components/events/event-hero";
import { EventsDayPanel } from "@/components/events/events-day-panel";
import { EventsClassesShelf } from "@/components/events/events-classes-shelf";
import { EventsDayView } from "@/components/events/events-day-view";
import { parseDayParam } from "@/lib/events-day";
import { EventsMonth } from "@/components/events/events-month";
import { EventsFilterBar, FilterChip, type FilterGroup } from "@/components/events/events-filter-bar";
import {
  DateBadge,
  LINE,
  MUTED,
  PAGE,
  SATCHEL_TONES,
  SERIF,
  SURFACE,
  ToneChip,
} from "@/components/person/satchel";
import { Skeleton } from "@/components/ui/skeleton";
import { hasMapLocation, mapUrl } from "@/lib/event-detail";
import { useToday } from "@/hooks/use-today";
import {
  CATEGORY_META,
  dateKeyInZone,
  formatCost,
  formatWhen,
  agendaColumns,
  groupForAgenda,
  isTripIdea,
  statusBadge,
  tripBadge,
  useEventItems,
  useEventPreferences,
  useEventsStatus,
  type EventItem,
} from "@/lib/events";
import {
  DEFAULT_BROWSE,
  DEFAULT_FILTERS,
  FILTER_LABELS,
  activeFilterCount,
  dayAllowed,
  kindCounts,
  isUpcoming,
  matchesFilters,
  parseBrowse,
  topicOptions,
  type EventFilters,
  type EventsBrowse,
} from "@/lib/events-filters";
import { useSessionState } from "@/hooks/use-session-state";
import { queryKeys } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAP_BTN =
  "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-semibold leading-none bg-[#dde8f1] text-[#3d6a8f] dark:bg-[#8fb4d4]/15 dark:text-[#8fb4d4]";

const RESPONSE_LABELS: Record<string, string> = {
  going: "Going",
  interested: "Interested",
  maybe: "Maybe",
  "not-interested": "Not for us",
  dismissed: "Dismissed",
};

export function AgendaCard({ item, date }: { item: EventItem; date?: string }) {
  const { event } = item;
  const tz = event.schedule.timezone;
  const startKey = date ?? dateKeyInZone(event.schedule.start, tz);
  const [y, m, d] = startKey.split("-").map(Number);
  const cat = CATEGORY_META[event.category];
  const badge = statusBadge(event.status, event.updates);
  const km = item.rec.distanceKm;
  const responseLabel = RESPONSE_LABELS[item.response];
  return (
    <div
      className={cn(
        "flex min-h-16 items-start gap-2.5 rounded-2xl border p-2.5",
        SURFACE,
        LINE,
      )}
      data-testid={`events-card-${item.eventId}`}
    >
      <Link href={`/${encodeURIComponent(item.eventId)}`} className="flex min-w-0 flex-1 items-start gap-2.5">
      <DateBadge
        tone={cat.tone}
        top={new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        })}
        num={d}
        size={44}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div
          className={cn(
            SERIF,
            "line-clamp-2 text-base font-bold leading-snug text-[#1a1612] dark:text-foreground",
            event.status === "cancelled" && "line-through",
          )}
        >
          {event.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm", MUTED)}>
            {formatWhen(event.schedule, "12h")}
            {km !== undefined && ` · ${km.toFixed(1)} km`}
            {` · ${formatCost(event.cost)}`}
          </span>
          <ToneChip tone={cat.tone}>{cat.label}</ToneChip>
          {responseLabel && (
            <ToneChip tone={item.response === "going" ? "leaf" : "stone"}>
              {responseLabel}
            </ToneChip>
          )}
          {badge && <ToneChip tone={badge.tone}>{badge.label}</ToneChip>}
          {item.closeToHome === true && (
            <ToneChip tone="leaf" data-testid={`events-close-${item.eventId}`}>
              Close to home
            </ToneChip>
          )}
          {item.hasUnseenUpdate && (
            <ToneChip
              tone="clay"
              data-testid={`events-changed-${item.eventId}`}
            >
              Changed
            </ToneChip>
          )}
        </div>
      </div>
      </Link>
      {hasMapLocation(event.location) && (
        <a
          href={mapUrl(event.location)}
          target="_blank"
          rel="noopener noreferrer"
          className={MAP_BTN}
          aria-label={`Open ${event.location.venueName || event.title} in Google Maps`}
          data-testid={`events-card-map-${item.eventId}`}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Map
        </a>
      )}
    </div>
  );
}

function TripCard({ item }: { item: EventItem }) {
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      className={cn("block min-h-16 space-y-1 rounded-2xl border p-3", SURFACE, LINE)}
      data-testid={`events-trip-${item.eventId}`}
    >
      <div
        className={cn(SERIF, "line-clamp-2 text-base font-bold leading-snug text-[#1a1612] dark:text-foreground")}
      >
        {item.event.title}
      </div>
      <ToneChip tone="leaf">{tripBadge(item)}</ToneChip>
      {item.event.summary && (
        <p className={cn("line-clamp-3 text-sm", MUTED)}>{item.event.summary}</p>
      )}
    </Link>
  );
}

function TripIdeas({ trips, chipOn, tripsEnabled }: { trips: EventItem[]; chipOn: boolean; tripsEnabled: boolean }) {
  if (trips.length === 0) {
    if (!chipOn) return null;
    return (
      <p className={cn("text-base", MUTED)} data-testid="events-trips-none">
        {tripsEnabled ? (
          "No trip ideas yet. We research a new one each morning."
        ) : (
          <>
            Trip ideas are off.{" "}
            <Link href="~/settings?section=apps&app=events" className="underline" data-testid="events-trips-settings">
              Turn them on in Events settings
            </Link>
            .
          </>
        )}
      </p>
    );
  }
  return (
    <section aria-labelledby="events-trips" className="space-y-2" data-testid="events-trips">
      <h2 id="events-trips" className={cn(SERIF, "text-2xl font-bold", SATCHEL_TONES.leaf.fg)}>
        Trip ideas
      </h2>
      <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-4">
        {trips.map((item) => (
          <TripCard key={item.eventId} item={item} />
        ))}
      </div>
    </section>
  );
}

function NoneMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="space-y-2" data-testid="events-none-match">
      <p className={cn("text-lg", MUTED)}>No events match these filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 rounded-full border px-4 text-base font-semibold"
        data-testid="events-none-match-clear"
      >
        Clear filters
      </button>
    </div>
  );
}

/**
 * Splits the visible items: calendarItems leave out ongoing classes (no published session
 * times, so not an event on a specific date); classItems feed the classes shelf.
 */
export function splitClasses(
  visible: EventItem[],
  kind: EventFilters["kind"],
  today: string,
): { dated: EventItem[]; calendarItems: EventItem[]; classItems: EventItem[] } {
  const dated = visible.filter((i) => !isTripIdea(i));
  const calendarItems = dated.filter((i) => !isOngoingClass(i.event));
  const hasSession = (e: EventItem["event"]) =>
    dayWindows(e as FfEvent).some((w) => w.kind === "session");
  const hasDayFromToday = (e: EventItem["event"]) =>
    dayWindows(e as FfEvent, { from: today }).some((w) => w.date >= today);
  const classItems = dated.filter((i) =>
    kind === "classes"
      ? isSignUpActivity(i.event) && !hasSession(i.event) && hasDayFromToday(i.event)
      : isOngoingClass(i.event) && hasDayFromToday(i.event),
  );
  return { dated, calendarItems, classItems };
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayHeading(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return date === today ? `Today · ${label}` : label;
}

function Overview({ day }: { day?: string }) {
  const today = useToday();
  const [, setLocation] = useLocation();
  const [browse, setBrowse] = useSessionState<EventsBrowse>("ff.events.browse.v1", DEFAULT_BROWSE, parseBrowse);
  const { view, month: storedMonth, selectedDate: storedDate } = browse;
  const month = storedMonth ?? `${today.slice(0, 7)}-01`;
  const selectedDate = day ?? storedDate ?? today;
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: items = [], isLoading } = useEventItems({ includeHidden: true });
  const { data: status } = useEventsStatus();
  const { data: prefs } = useEventPreferences();
  const tripsEnabled = prefs?.tripsEnabled !== false;
  const { data: allPeople = [] } = useQuery<Person[]>({ queryKey: queryKeys.people() });

  // Remember the open day for the event page's back link; the overview clears it.
  useEffect(() => {
    setBrowse((b) => {
      if (day) {
        const month = `${day.slice(0, 7)}-01`;
        return b.lastDay === day && b.selectedDate === day && b.month === month
          ? b
          : { ...b, lastDay: day, selectedDate: day, month };
      }
      return b.lastDay === null ? b : { ...b, lastDay: null };
    });
    // setBrowse is stable per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const setView = (v: EventsBrowse["view"]) => {
    setBrowse((b) => ({ ...b, view: v }));
    if (day) setLocation("/");
  };
  const openDay = (iso: string) => {
    setBrowse((b) => ({ ...b, selectedDate: iso, month: `${iso.slice(0, 7)}-01`, lastDay: iso }));
    setLocation(`/day/${iso}`, { replace: true });
  };
  const setFilters = (patch: Partial<EventFilters>) =>
    setBrowse((b) => {
      const next = { ...b, filters: { ...b.filters, ...patch } };
      if (patch.when && patch.when !== "any") {
        const ok = dayAllowed(patch.when, today);
        const cur = b.selectedDate ?? today;
        if (!ok(cur)) {
          let d = cur < today ? today : cur;
          for (let i = 0; i < 14 && !ok(d); i++) d = nextDay(d);
          if (ok(d)) return { ...next, selectedDate: d, month: `${d.slice(0, 7)}-01` };
        }
      }
      return next;
    });

  const people = useMemo(
    () =>
      allPeople.flatMap((p) => {
        const age = ageOn(p.birthday, today);
        return age === null ? [] : [{ id: p.id, name: p.name, age }];
      }),
    [allPeople, today],
  );
  const showWho = people.length >= 2;
  // Stored ids that no longer exist are ignored.
  const filters = useMemo<EventFilters>(
    () => ({
      ...browse.filters,
      people: showWho ? browse.filters.people.filter((id) => people.some((p) => p.id === id)) : [],
    }),
    [browse.filters, people, showWho],
  );
  const ctx = useMemo(
    () => ({ today, ages: people.filter((p) => filters.people.includes(p.id)).map((p) => p.age) }),
    [today, people, filters.people],
  );

  const live = useMemo(() => items.filter((i) => !i.withdrawn), [items]);
  const visible = useMemo(() => live.filter((i) => matchesFilters(i, filters, ctx)), [live, filters, ctx]);
  const upcomingLive = useMemo(() => live.filter((i) => isUpcoming(i, today)), [live, today]);
  const upcomingVisible = useMemo(() => visible.filter((i) => isUpcoming(i, today)), [visible, today]);
  const trips = useMemo(() => visible.filter(isTripIdea), [visible]);
  const { dated, calendarItems, classItems } = useMemo(
    () => splitClasses(visible, filters.kind, today),
    [visible, filters.kind, today],
  );
  const dayOk = useMemo(
    () => (filters.when === "any" ? undefined : dayAllowed(filters.when, today)),
    [filters.when, today],
  );
  const { next14, later, dates } = useMemo(
    () => groupForAgenda(calendarItems, today, dayOk),
    [calendarItems, today, dayOk],
  );
  const counts4 = useMemo(() => kindCounts(items, filters, ctx), [items, filters, ctx]);
  const topics = useMemo(() => topicOptions(items), [items]);

  const groups: FilterGroup[] = [
    {
      key: "response",
      label: "Show",
      options: [...FILTER_LABELS.response],
      value: filters.response,
      defaultValue: DEFAULT_FILTERS.response,
      onSelect: (id) => setFilters({ response: id as EventFilters["response"] }),
    },
    {
      key: "when",
      label: "When",
      options: [...FILTER_LABELS.when],
      value: filters.when,
      defaultValue: DEFAULT_FILTERS.when,
      onSelect: (id) => setFilters({ when: id as EventFilters["when"] }),
    },
    {
      key: "kind",
      label: "What",
      options: FILTER_LABELS.kind.map((o) => ({
        ...o,
        count: o.id === "all" ? undefined : counts4[o.id as keyof typeof counts4],
      })),
      value: filters.kind,
      defaultValue: DEFAULT_FILTERS.kind,
      onSelect: (id) => setFilters({ kind: id as EventFilters["kind"] }),
      caption: "Day trips: under 1½ hours' drive. Weekend getaways: under 2½ hours with a place to stay.",
    },
    {
      key: "distance",
      label: "How far",
      options: [...FILTER_LABELS.distance],
      value: filters.distance,
      defaultValue: DEFAULT_FILTERS.distance,
      onSelect: (id) => setFilters({ distance: id as EventFilters["distance"] }),
      caption: `Close to home: within ${CLOSE_TO_HOME_MILES} miles of home or in your city. Nearby: under 45 minutes' drive.`,
    },
    {
      key: "cost",
      label: "Cost",
      options: [...FILTER_LABELS.cost],
      value: filters.cost,
      defaultValue: DEFAULT_FILTERS.cost,
      onSelect: (id) => setFilters({ cost: id as EventFilters["cost"] }),
    },
    {
      key: "category",
      label: "Topic",
      options: [
        { id: "all", label: "All topics" },
        ...topics.map((c) => ({ id: c as string, label: CATEGORY_META[c].label })),
      ],
      value: filters.category ?? "all",
      defaultValue: "all",
      collapsible: true,
      onSelect: (id) => setFilters({ category: id === "all" || id === filters.category ? null : (id as EventFilters["category"]) }),
    },
  ];
  if (showWho) {
    groups.push({
      key: "people",
      label: "Who",
      options: [{ id: "everyone", label: "Everyone" }, ...people.map((p) => ({ id: p.id, label: p.name }))],
      value: filters.people.length > 0 ? filters.people : "everyone",
      defaultValue: "everyone",
      multi: true,
      onSelect: (id) =>
        setFilters({
          people:
            id === "everyone"
              ? []
              : filters.people.includes(id)
                ? filters.people.filter((x) => x !== id)
                : [...filters.people, id],
        }),
    });
  }

  const changeMonth = (monthIso: string) => {
    const ym = monthIso.slice(0, 7);
    setBrowse((b) => ({ ...b, month: monthIso, selectedDate: today.slice(0, 7) === ym ? today : `${ym}-01` }));
  };
  const selectDate = (iso: string) => {
    setBrowse((b) => ({ ...b, selectedDate: iso, month: `${iso.slice(0, 7)}-01` }));
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      // Wait for the panel to render the new day before scrolling.
      requestAnimationFrame(() => panelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  };

  const tripChip = filters.kind === "day-trip" || filters.kind === "weekend";
  const clearFilters = () => setBrowse((b) => ({ ...b, filters: DEFAULT_FILTERS }));
  const hideGrid = tripChip && dated.length === 0;
  const showAllClasses = () => setFilters({ kind: "classes" });
  const fullShelf = filters.kind === "classes";
  const statusCounts = status?.counts;
  const columns = useMemo(() => agendaColumns(next14, 3), [next14]);

  return (
    <div
      className={cn("min-h-full space-y-3 p-3 lg:p-4", PAGE)}
      data-testid="events-overview"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1
          className={cn(
            SERIF,
            "mr-2 text-2xl font-bold text-[#1a1612] dark:text-foreground",
          )}
        >
          Events
        </h1>
        {statusCounts && (
          <p className={cn("mr-2 text-sm", MUTED)} data-testid="events-counts">
            {statusCounts.new} new · {statusCounts.going} going · {statusCounts.changed} changed
          </p>
        )}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="View"
        >
          <FilterChip selected={!day && view === "agenda"} onClick={() => setView("agenda")} testId="events-view-agenda">
            <List className="h-5 w-5" aria-hidden /> Agenda
          </FilterChip>
          <FilterChip selected={!day && view === "month"} onClick={() => setView("month")} testId="events-view-month">
            <CalendarDays className="h-5 w-5" aria-hidden /> Month
          </FilterChip>
          <FilterChip selected={day !== undefined} onClick={() => openDay(selectedDate)} testId="events-view-day">
            <CalendarRange className="h-5 w-5" aria-hidden /> Day
          </FilterChip>
        </div>
      </div>

      <EventsFilterBar
        groups={groups}
        shown={upcomingVisible.length}
        total={upcomingLive.length}
        activeCount={activeFilterCount(filters)}
        onClear={clearFilters}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : day ? (
        <EventsDayView
          items={dayOk && !dayOk(day) ? [] : dated}
          trips={trips}
          dateIso={day}
          todayIso={today}
          isDayShown={dayOk}
          onDateChange={openDay}
        />
      ) : view === "month" ? (
        <div className="space-y-3">
          {tripChip && <TripIdeas trips={trips} chipOn tripsEnabled={tripsEnabled} />}
          {visible.length === 0 && <NoneMatch onClear={clearFilters} />}
          {fullShelf && <EventsClassesShelf items={classItems} />}
          {!hideGrid && (
            <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-3 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
              <EventsMonth
                items={calendarItems}
                monthIso={month}
                onMonthChange={changeMonth}
                weekStartsMonday
                selectedDate={selectedDate}
                onSelectDate={selectDate}
                isDayShown={dayOk}
              />
              {/* 5rem = App.tsx h-14 header (3.5rem) + 0.75rem top offset + 0.75rem bottom gap */}
              <div
                ref={panelRef}
                className="lg:sticky lg:top-3 lg:flex lg:max-h-[calc(100dvh-5rem)] lg:flex-col"
              >
                <EventsDayPanel items={dayOk && !dayOk(selectedDate) ? [] : dated} dateIso={selectedDate} onDateChange={selectDate} />
              </div>
            </div>
          )}
        </div>
      ) : next14.length === 0 && later.length === 0 && trips.length === 0 && classItems.length === 0 ? (
        <div className="space-y-3">
          {tripChip && <TripIdeas trips={trips} chipOn tripsEnabled={tripsEnabled} />}
          <NoneMatch onClear={clearFilters} />
        </div>
      ) : (
        <div className="space-y-4">
          <TripIdeas trips={trips} chipOn={tripChip} tripsEnabled={tripsEnabled} />
          {fullShelf ? (
            <EventsClassesShelf items={classItems} />
          ) : (
            <EventsClassesShelf items={classItems} limit={4} onShowAll={showAllClasses} />
          )}
          <section aria-labelledby="events-next14" className="space-y-2">
            <h2
              id="events-next14"
              className={cn(SERIF, "text-2xl font-bold", SATCHEL_TONES.clay.fg)}
            >
              Next 14 days
            </h2>
            {next14.length === 0 && (
              <p className={cn("text-base", MUTED)}>
                Nothing in the next two weeks.
              </p>
            )}
            <div className="space-y-2 lg:grid lg:grid-cols-3 lg:items-start lg:gap-3 lg:space-y-0">
              {columns.map((col, i) => (
                <div key={i} className="space-y-2 lg:space-y-3">
                  {col.map((group) => (
                    <div
                      key={group.date}
                      className="space-y-1.5"
                      data-testid={`events-day-${group.date}`}
                    >
                      <h3 className="text-base font-bold text-[#1a1612] dark:text-foreground">
                        <Link
                          href={`/day/${group.date}`}
                          className="underline-offset-2 hover:underline"
                          data-testid={`events-day-link-${group.date}`}
                        >
                          {dayHeading(group.date, today)}
                        </Link>
                      </h3>
                      {group.items.map((item) => (
                        <AgendaCard key={item.eventId} item={item} date={group.date} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
          {later.length > 0 && (
            <section aria-labelledby="events-later" className="space-y-2">
              <h2
                id="events-later"
                className={cn(
                  SERIF,
                  "text-xl font-bold text-[#1a1612] dark:text-foreground",
                )}
              >
                Later
              </h2>
              <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {later.map((item) => (
                  <AgendaCard key={item.eventId} item={item} date={dates.get(item)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function formatPublished(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function EventsContent() {
  const [, setLocation] = useLocation();
  const [dayMatch, dayParams] = useRoute<{ date: string }>("/day/:date");
  const [match, params] = useRoute<{ eventId: string }>("/:eventId");
  const { data: status, isLoading } = useEventsStatus();
  const { data: items, isLoading: itemsLoading } = useEventItems();

  if (dayMatch && dayParams && parseDayParam(dayParams.date) === null) return <Redirect to="/" replace />;
  if (match && params && params.eventId === "day") return <Redirect to="/" replace />;

  if (match && params)
    return <EventHero eventId={decodeURIComponent(params.eventId)} />;

  if (isLoading || itemsLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!status?.sharingEnabled) {
    return (
      <EmptyState
        icon={CalendarHeart}
        title="Find events near you"
        description="Event recommendations suggest family-friendly things to do near your home, like parks, festivals, markets and kids activities. To get them, turn on sharing your address with the events service in Settings."
        actionLabel="Open location settings"
        onAction={() => setLocation("~/settings?section=location")}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={Hourglass}
        title="Looking for events"
        description="We have started looking for events near you. Your first suggestions usually arrive within the hour."
      >
        {status.lastPublishedAt && (
          <p
            className="mt-4 text-sm text-muted-foreground"
            data-testid="events-last-published"
          >
            Last checked {formatPublished(status.lastPublishedAt)}
          </p>
        )}
      </EmptyState>
    );
  }

  const dayIso = dayMatch && dayParams ? parseDayParam(dayParams.date) : null;
  return <Overview day={dayIso ?? undefined} />;
}

export default function EventsPage() {
  return (
    <div className="h-full overflow-y-auto" data-testid="events-scroll">
      <EventsContent />
    </div>
  );
}
