import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { CalendarDays, CalendarHeart, Hourglass, List } from "lucide-react";
import type { EventCategory } from "@shared/events";
import { EmptyState } from "@/components/empty-state";
import { EventHero } from "@/components/events/event-hero";
import { EventsDayPanel } from "@/components/events/events-day-panel";
import { EventsMonth } from "@/components/events/events-month";
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
import { useToday } from "@/hooks/use-today";
import {
  CATEGORY_META,
  dateKeyInZone,
  formatCost,
  formatWhen,
  agendaColumns,
  groupForAgenda,
  isPaidOrTicketed,
  isTripIdea,
  matchesTripFilter,
  statusBadge,
  tripBadge,
  type TripFilter,
  useEventItems,
  useEventsStatus,
  type EventItem,
} from "@/lib/events";
import { cn } from "@/lib/utils";

type ResponseFilter = "active" | "new" | "going" | "interested" | "all";
type View = "agenda" | "month";

const RESPONSE_FILTERS: { id: ResponseFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "new", label: "New" },
  { id: "going", label: "Going" },
  { id: "interested", label: "Interested" },
  { id: "all", label: "All" },
];

const TRIP_FILTERS: { id: TripFilter; label: string }[] = [
  { id: "local", label: "Nearby" },
  { id: "day-trip", label: "Day trips" },
  { id: "weekend", label: "Weekends" },
  { id: "all", label: "All" },
];

const HIDDEN_RESPONSES = new Set(["not-interested", "dismissed"]);
const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-sm lg:text-base font-semibold";

function matchesResponse(item: EventItem, filter: ResponseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return !HIDDEN_RESPONSES.has(item.response);
  return item.response === filter;
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        BTN,
        active
          ? "border-[#a83818] bg-[#a83818] text-white dark:border-[#e07a52] dark:bg-[#e07a52] dark:text-[#1a1612]"
          : cn(SURFACE, LINE, "text-[#1a1612] dark:text-foreground"),
      )}
    >
      {children}
    </button>
  );
}

const RESPONSE_LABELS: Record<string, string> = {
  going: "Going",
  interested: "Interested",
  maybe: "Maybe",
  "not-interested": "Not for us",
  dismissed: "Dismissed",
};

function AgendaCard({ item }: { item: EventItem }) {
  const { event } = item;
  const tz = event.schedule.timezone;
  const startKey = dateKeyInZone(event.schedule.start, tz);
  const [y, m, d] = startKey.split("-").map(Number);
  const cat = CATEGORY_META[event.category];
  const badge = statusBadge(event.status, event.updates);
  const km = item.rec.distanceKm;
  const responseLabel = RESPONSE_LABELS[item.response];
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      className={cn(
        "flex min-h-16 items-start gap-2.5 rounded-2xl border p-2.5",
        SURFACE,
        LINE,
      )}
      data-testid={`events-card-${item.eventId}`}
    >
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

function Overview() {
  const today = useToday();
  const [view, setView] = useState<View>("agenda");
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [response, setResponse] = useState<ResponseFilter>("active");
  const [tripFilter, setTripFilter] = useState<TripFilter>("all");
  const [paidOnly, setPaidOnly] = useState(false);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(today);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: items = [], isLoading } = useEventItems({
    includeHidden: response === "all",
  });
  const { data: status } = useEventsStatus();

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          !i.withdrawn &&
          (!category || i.event.category === category) &&
          matchesResponse(i, response) &&
          matchesTripFilter(i, tripFilter) &&
          (!paidOnly || isPaidOrTicketed(i)),
      ),
    [items, category, response, tripFilter, paidOnly],
  );
  const trips = useMemo(() => visible.filter(isTripIdea), [visible]);
  const dated = useMemo(() => visible.filter((i) => !isTripIdea(i)), [visible]);
  const { next14, later } = useMemo(
    () => groupForAgenda(dated, today),
    [dated, today],
  );
  const usedCategories = useMemo(
    () => Array.from(new Set(items.map((i) => i.event.category))),
    [items],
  );

  const changeMonth = (monthIso: string) => {
    setMonth(monthIso);
    const ym = monthIso.slice(0, 7);
    setSelectedDate(today.slice(0, 7) === ym ? today : `${ym}-01`);
  };
  const selectDate = (iso: string) => {
    setSelectedDate(iso);
    setMonth(`${iso.slice(0, 7)}-01`);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      // Wait for the panel to render the new day before scrolling.
      requestAnimationFrame(() => panelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  };

  const counts = status?.counts;
  const columns = useMemo(() => agendaColumns(next14, 3), [next14]);

  return (
    <div
      className={cn("space-y-3 p-3 lg:p-4", PAGE)}
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
        {counts && (
          <p className={cn("mr-2 text-sm", MUTED)} data-testid="events-counts">
            {counts.new} new · {counts.going} going · {counts.changed} changed
          </p>
        )}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="View"
        >
          <Chip
            active={view === "agenda"}
            onClick={() => setView("agenda")}
            testId="events-view-agenda"
          >
            <List className="h-5 w-5" aria-hidden /> Agenda
          </Chip>
          <Chip
            active={view === "month"}
            onClick={() => setView("month")}
            testId="events-view-month"
          >
            <CalendarDays className="h-5 w-5" aria-hidden /> Month
          </Chip>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Response filter"
        >
          {RESPONSE_FILTERS.map((f) => (
            <Chip
              key={f.id}
              active={response === f.id}
              onClick={() => setResponse(f.id)}
              testId={`events-response-${f.id}`}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Trip type filter"
        >
          {TRIP_FILTERS.map((f) => (
            <Chip
              key={f.id}
              active={tripFilter === f.id}
              onClick={() => setTripFilter(f.id)}
              testId={`events-trip-filter-${f.id}`}
            >
              {f.label}
            </Chip>
          ))}
          <Chip
            active={paidOnly}
            onClick={() => setPaidOnly(!paidOnly)}
            testId="events-paid-filter"
          >
            Paid / Ticketed
          </Chip>
        </div>
        {usedCategories.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Category filter"
          >
            <Chip
              active={category === null}
              onClick={() => setCategory(null)}
              testId="events-category-all"
            >
              All categories
            </Chip>
            {usedCategories.map((c) => (
              <Chip
                key={c}
                active={category === c}
                onClick={() => setCategory(category === c ? null : c)}
                testId={`events-category-${c}`}
              >
                {CATEGORY_META[c].label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : view === "month" ? (
        <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-3 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <EventsMonth
            items={dated}
            monthIso={month}
            onMonthChange={changeMonth}
            weekStartsMonday
            selectedDate={selectedDate}
            onSelectDate={selectDate}
          />
          <div
            ref={panelRef}
            className="lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto"
          >
            <EventsDayPanel items={dated} dateIso={selectedDate} onDateChange={selectDate} />
          </div>
        </div>
      ) : next14.length === 0 && later.length === 0 && trips.length === 0 ? (
        <p className={cn("text-lg", MUTED)} data-testid="events-none-match">
          No events match these filters.
        </p>
      ) : (
        <div className="space-y-4">
          {trips.length > 0 && (
            <section aria-labelledby="events-trips" className="space-y-2" data-testid="events-trips">
              <h2
                id="events-trips"
                className={cn(SERIF, "text-2xl font-bold", SATCHEL_TONES.leaf.fg)}
              >
                Trip ideas
              </h2>
              <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {trips.map((item) => (
                  <TripCard key={item.eventId} item={item} />
                ))}
              </div>
            </section>
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
                        {dayHeading(group.date, today)}
                      </h3>
                      {group.items.map((item) => (
                        <AgendaCard key={item.eventId} item={item} />
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
                  <AgendaCard key={item.eventId} item={item} />
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
  const [match, params] = useRoute<{ eventId: string }>("/:eventId");
  const { data: status, isLoading } = useEventsStatus();
  const { data: items, isLoading: itemsLoading } = useEventItems();

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

  return <Overview />;
}

export default function EventsPage() {
  return (
    <div className="h-full overflow-y-auto" data-testid="events-scroll">
      <EventsContent />
    </div>
  );
}
