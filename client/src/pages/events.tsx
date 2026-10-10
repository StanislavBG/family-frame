import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { CalendarDays, CalendarHeart, Hourglass, List } from "lucide-react";
import type { EventCategory } from "@shared/events";
import { EmptyState } from "@/components/empty-state";
import { EventHero } from "@/components/events/event-hero";
import { EventsMonth } from "@/components/events/events-month";
import {
  DateBadge,
  LINE,
  MUTED,
  PAGE,
  SATCHEL_TONES,
  SectionLabel,
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
  groupForAgenda,
  statusBadge,
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

const HIDDEN_RESPONSES = new Set(["not-interested", "dismissed"]);
const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-base font-semibold";

function matchesResponse(item: EventItem, filter: ResponseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return !HIDDEN_RESPONSES.has(item.response);
  return item.response === filter;
}

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
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
      className={cn("flex min-h-16 items-start gap-3 rounded-2xl border p-3 sm:p-4", SURFACE, LINE)}
      data-testid={`events-card-${item.eventId}`}
    >
      <DateBadge
        tone={cat.tone}
        top={new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
        num={d}
        size={56}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className={cn(SERIF, "text-lg font-bold leading-snug text-[#1a1612] dark:text-foreground", event.status === "cancelled" && "line-through")}>
          {event.title}
        </div>
        <div className={cn("text-base", MUTED)}>
          {formatWhen(event.schedule, "12h")}
          {km !== undefined && ` · ${km.toFixed(1)} km`}
          {` · ${formatCost(event.cost)}`}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <ToneChip tone={cat.tone}>{cat.label}</ToneChip>
          {responseLabel && <ToneChip tone={item.response === "going" ? "leaf" : "stone"}>{responseLabel}</ToneChip>}
          {badge && <ToneChip tone={badge.tone}>{badge.label}</ToneChip>}
          {item.hasUnseenUpdate && (
            <ToneChip tone="clay" data-testid={`events-changed-${item.eventId}`}>
              Changed
            </ToneChip>
          )}
        </div>
      </div>
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
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const { data: items = [], isLoading } = useEventItems({ includeHidden: response === "all" });
  const { data: status } = useEventsStatus();

  const visible = useMemo(
    () => items.filter((i) => !i.withdrawn && (!category || i.event.category === category) && matchesResponse(i, response)),
    [items, category, response],
  );
  const { next14, later } = useMemo(() => groupForAgenda(visible, today), [visible, today]);
  const usedCategories = useMemo(() => Array.from(new Set(items.map((i) => i.event.category))), [items]);

  const counts = status?.counts;

  return (
    <div className={cn("min-h-full space-y-5 p-4 sm:p-6", PAGE)} data-testid="events-overview">
      <header className="space-y-1">
        <h1 className={cn(SERIF, "text-3xl font-bold text-[#1a1612] dark:text-foreground")}>Events</h1>
        {counts && (
          <p className={cn("text-base", MUTED)} data-testid="events-counts">
            {counts.new} new · {counts.going} going · {counts.changed} changed
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="View">
        <Chip active={view === "agenda"} onClick={() => setView("agenda")} testId="events-view-agenda">
          <List className="h-5 w-5" aria-hidden /> Agenda
        </Chip>
        <Chip active={view === "month"} onClick={() => setView("month")} testId="events-view-month">
          <CalendarDays className="h-5 w-5" aria-hidden /> Month
        </Chip>
      </div>

      <div className="space-y-2">
        <SectionLabel>Show</SectionLabel>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Response filter">
          {RESPONSE_FILTERS.map((f) => (
            <Chip key={f.id} active={response === f.id} onClick={() => setResponse(f.id)} testId={`events-response-${f.id}`}>
              {f.label}
            </Chip>
          ))}
        </div>
        {usedCategories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Category filter">
            <Chip active={category === null} onClick={() => setCategory(null)} testId="events-category-all">
              All categories
            </Chip>
            {usedCategories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)} testId={`events-category-${c}`}>
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
        <EventsMonth items={visible} monthIso={month} onMonthChange={setMonth} weekStartsMonday />
      ) : next14.length === 0 && later.length === 0 ? (
        <p className={cn("text-lg", MUTED)} data-testid="events-none-match">
          No events match these filters.
        </p>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="events-next14" className="space-y-4">
            <h2 id="events-next14" className={cn(SERIF, "text-2xl font-bold", SATCHEL_TONES.clay.fg)}>
              Next 14 days
            </h2>
            {next14.length === 0 && <p className={cn("text-base", MUTED)}>Nothing in the next two weeks.</p>}
            {next14.map((group) => (
              <div key={group.date} className="space-y-2" data-testid={`events-day-${group.date}`}>
                <h3 className="text-lg font-bold text-[#1a1612] dark:text-foreground">{dayHeading(group.date, today)}</h3>
                {group.items.map((item) => (
                  <AgendaCard key={item.eventId} item={item} />
                ))}
              </div>
            ))}
          </section>
          {later.length > 0 && (
            <section aria-labelledby="events-later" className="space-y-3">
              <h2 id="events-later" className={cn(SERIF, "text-xl font-bold text-[#1a1612] dark:text-foreground")}>
                Later
              </h2>
              {later.map((item) => (
                <AgendaCard key={item.eventId} item={item} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function formatPublished(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function EventsPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ eventId: string }>("/:eventId");
  const { data: status, isLoading } = useEventsStatus();
  const { data: items, isLoading: itemsLoading } = useEventItems();

  if (match && params) return <EventHero eventId={decodeURIComponent(params.eventId)} />;

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
        description="We are looking for events near you. First suggestions usually arrive within a day."
      >
        {status.lastPublishedAt && (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="events-last-published">
            Last checked {formatPublished(status.lastPublishedAt)}
          </p>
        )}
      </EmptyState>
    );
  }

  return <Overview />;
}
