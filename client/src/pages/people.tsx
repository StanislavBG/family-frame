import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarDays, Database, Image, Mail, Moon, Sun, UserRound } from "lucide-react";
import type { Person } from "@shared/schema";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/api";
import {
  buildDataRecordsUrl,
  useDataSchemas,
  useMailMessages,
  useMediaList,
  usePersonDays,
  usePersonWeeks,
  type DataRecordsResponse,
} from "@/lib/agent-data";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import {
  LINE,
  MONO,
  MUTED,
  OwlAvatar,
  PAGE,
  SATCHEL_TONES,
  SERIF,
  SURFACE,
  SectionLabel,
  type SatchelTone,
} from "@/components/person/satchel";
import PersonDashboard from "@/components/person/person-dashboard";
import PersonCalendar from "@/components/person/person-calendar";
import PersonInbox from "@/components/person/person-inbox";
import PersonPhotos from "@/components/person/person-photos";
import PersonSheets from "@/components/person/person-sheets";
import PersonMore from "@/components/person/person-more";

// Order and colours follow the Satchel design's left nav.
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Sun, tone: "sun", Component: PersonDashboard },
  { id: "inbox", label: "Inbox", icon: Mail, tone: "sky", Component: PersonInbox },
  { id: "calendar", label: "Calendar", icon: CalendarDays, tone: "clay", Component: PersonCalendar },
  { id: "photos", label: "Photos", icon: Image, tone: "leaf", Component: PersonPhotos },
  { id: "sheets", label: "Daily sheets", icon: Moon, tone: "plum", Component: PersonSheets },
  { id: "more", label: "More", icon: Database, tone: "stone", Component: PersonMore },
] as const satisfies readonly { tone: SatchelTone; [key: string]: unknown }[];

type TabId = (typeof TABS)[number]["id"];

interface PersonNavInfo {
  tabs: TabId[];
  /** All visibility queries have settled, so `tabs` is final. */
  ready: boolean;
  counts: Partial<Record<TabId, string>>;
  source?: string;
  syncedAt?: string;
}

const UNREAD_COUNT_LIMIT = 200;

/** Which tabs have data for this person (Dashboard and Calendar always), nav counts and sync info. */
function usePersonTabs(personId: string): PersonNavInfo {
  const mail = useMailMessages({ personId, limit: 1 });
  const unread = useMailMessages({ personId, unreadOnly: true, limit: UNREAD_COUNT_LIMIT });
  const media = useMediaList({ personId, kind: "image", limit: 1 });
  const days = usePersonDays(personId, { limit: 1 });
  const weeks = usePersonWeeks(personId, { limit: 1 });
  const { data: schemas } = useDataSchemas();

  const customSchemaIds = useMemo(
    () => (schemas ?? []).map((s) => s.id).filter((id) => !id.startsWith("ff-")),
    [schemas],
  );
  const customRecords = useQueries({
    queries: customSchemaIds.map((schemaId) => {
      const params = { personId, limit: 1 };
      return {
        queryKey: queryKeys.data.records(schemaId, params),
        queryFn: () =>
          apiRequest<DataRecordsResponse>("GET", buildDataRecordsUrl(schemaId, params)),
      };
    }),
  });

  const tabs: TabId[] = ["dashboard", "calendar"];
  if ((mail.data?.emails.length ?? 0) > 0) tabs.push("inbox");
  if ((media.data?.total ?? 0) > 0) tabs.push("photos");
  if ((days.data?.records.length ?? 0) > 0 || (weeks.data?.records.length ?? 0) > 0) {
    tabs.push("sheets");
  }
  if (customRecords.some((q) => (q.data?.records.length ?? 0) > 0)) tabs.push("more");

  const counts: PersonNavInfo["counts"] = {};
  const unreadCount = unread.data?.emails.length ?? 0;
  if (unreadCount > 0) counts.inbox = `${unreadCount}${unread.data?.nextBefore ? "+" : ""}`;
  if (media.data?.total) counts.photos = String(media.data.total);
  if (days.data?.total) counts.sheets = String(days.data.total);

  const latestDay = days.data?.records[0];
  const stamps = [latestDay?.updatedAt, mail.data?.emails[0]?.receivedAt].filter((t): t is string => !!t);
  const ready =
    !mail.isLoading &&
    !media.isLoading &&
    !days.isLoading &&
    !weeks.isLoading &&
    schemas !== undefined &&
    customRecords.every((q) => !q.isLoading);
  return {
    tabs,
    ready,
    counts,
    source: latestDay?.data?.source,
    syncedAt: stamps.sort().at(-1),
  };
}

function PersonCard({ person }: { person: Person }) {
  return (
    <Link
      href={`/${encodeURIComponent(person.id)}`}
      aria-label={`Open ${person.name}`}
      data-testid={`card-person-${person.id}`}
    >
      <Card className="hover-elevate cursor-pointer h-full">
        <CardContent className="p-8 flex flex-col items-center text-center gap-3">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <UserRound className="h-10 w-10 text-primary" />
          </div>
          <div className="text-2xl font-semibold">{person.name}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function NavRow({
  href,
  label,
  icon: Icon,
  tone,
  count,
  active,
  onClick,
  testId,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: SatchelTone;
  count?: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  const t = SATCHEL_TONES[tone];
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-base transition-colors",
        active ? cn(SURFACE, "font-bold") : "font-medium hover:bg-[#fffaf0] dark:hover:bg-card",
      )}
      data-testid={testId}
    >
      <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-[10px]", t.bg, t.fg)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count && <span className={cn(MONO, "text-xs", MUTED)}>{count}</span>}
    </Link>
  );
}

/** Second-level left menu in the Satchel style: identity card, sections, other people, sync footer. */
function PersonView({ person, people, tab }: { person: Person; people: Person[]; tab?: string }) {
  const nav = usePersonTabs(person.id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const visibleTabs = TABS.filter((t) => nav.tabs.includes(t.id) || t.id === active.id);
  const Active = active.Component;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [, setLocation] = useLocation();
  const personBase = (p: Person) => `/${encodeURIComponent(p.id)}`;

  // A section with no data for this person (e.g. after switching person) falls back to Dashboard.
  const hidden = nav.ready && !nav.tabs.includes(active.id);
  useEffect(() => {
    if (hidden) setLocation(`${personBase(person)}/dashboard`, { replace: true });
  }, [hidden, person.id]);
  const others = people.filter((p) => p.id !== person.id);
  const close = () => setMobileNavOpen(false);

  const menu = (
    <>
      <nav className="flex flex-col gap-1" aria-label={`${person.name} sections`}>
        {visibleTabs.map((t) => (
          <NavRow
            key={t.id}
            href={`${personBase(person)}/${t.id}`}
            label={t.label}
            icon={t.icon}
            tone={t.tone}
            count={nav.counts[t.id]}
            active={t.id === active.id}
            onClick={close}
            testId={`tab-person-${t.id}`}
          />
        ))}
      </nav>
      {others.length > 0 && (
        <div className="mt-4">
          <SectionLabel className="px-2.5 pb-1">Family</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Other family members">
            {others.map((p) => (
              <li key={p.id}>
                <Link
                  // Keep the current section when switching person; hidden-empty sections fall back to Dashboard.
                  href={`${personBase(p)}/${active.id}`}
                  onClick={close}
                  className="flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-base font-medium hover:bg-[#fffaf0] dark:hover:bg-card"
                  data-testid={`nav-person-${p.id}`}
                >
                  <UserRound className={cn("h-5 w-5", MUTED)} />
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  const identity = (
    <div className={cn("flex items-center gap-3 rounded-[18px] border p-3", SURFACE, LINE)}>
      <OwlAvatar />
      <div className="min-w-0">
        <h1 className={cn(SERIF, "truncate text-lg font-bold leading-tight")} data-testid="text-person-name">
          {person.name}
        </h1>
        {nav.source && (
          <div className="truncate text-xs font-semibold text-[#a83818] dark:text-[#e07a52]">{nav.source}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("h-full flex flex-col md:flex-row text-[#1a1612] dark:text-foreground", PAGE)}>
      {/* Mobile Header */}
      <div className={cn("md:hidden flex items-center justify-between gap-2 border-b p-3", LINE)}>
        <Button asChild variant="ghost" size="icon" className="flex-none">
          <Link href="/" aria-label="Back to people" data-testid="button-people-back-mobile">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">{identity}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-expanded={mobileNavOpen}
          data-testid="button-person-mobile-nav"
        >
          {active.label}
        </Button>
      </div>
      {mobileNavOpen && <div className={cn("md:hidden border-b p-3", LINE)}>{menu}</div>}

      {/* Left Navigation Panel - Desktop */}
      <aside
        className={cn(
          "hidden md:flex w-[232px] shrink-0 flex-col gap-1 border-r px-3.5 py-5",
          "bg-[#ede6d6] dark:bg-muted/30",
          LINE,
        )}
      >
        <Link
          href="/"
          className={cn("mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold hover:underline", MUTED)}
          data-testid="button-people-back"
        >
          <ArrowLeft className="h-4 w-4" /> People
        </Link>
        <div className="mb-3.5">{identity}</div>
        <ScrollArea className="flex-1">{menu}</ScrollArea>
        {nav.syncedAt && (
          <div
            className="mt-2 rounded-[14px] bg-[#dce8d6] p-3 text-xs leading-normal text-[#2e5a3e] dark:bg-[#8fc49d]/15 dark:text-[#8fc49d]"
            data-testid="text-person-synced"
          >
            <b>● Synced {formatRelativeTime(nav.syncedAt)}</b>
            {nav.source && (
              <>
                <br />
                {nav.source}
              </>
            )}
          </div>
        )}
      </aside>

      {/* Right Content Panel */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto" role="region" aria-label={`${person.name} ${active.label}`}>
        {/* Keyed by person so every section starts with fresh per-person state. */}
        <Active key={person.id} person={person} />
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ personId: string; tab?: string }>("/:personId/:tab?");
  const { data: people, isLoading } = useQuery<Person[]>({ queryKey: ["/api/people/list"] });

  if (isLoading) {
    return (
      <div className="p-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (!people || people.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No family members yet"
        description="Add family members in settings to see their calendar, inbox, photos and daily sheets."
        actionLabel="Go to settings"
        onAction={() => setLocation("~/settings")}
      />
    );
  }

  if (match && params) {
    const person = people.find((p) => p.id === decodeURIComponent(params.personId));
    if (!person) {
      return (
        <EmptyState
          icon={UserRound}
          title="Person not found"
          description="This person is not part of your household."
          actionLabel="Back to people"
          onAction={() => setLocation("/")}
        />
      );
    }
    return <PersonView person={person} people={people} tab={params.tab} />;
  }

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-3xl font-semibold p-6 pb-0">People</h1>
      <div className="p-6 grid gap-6 grid-cols-2 lg:grid-cols-4" data-testid="grid-people">
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
    </div>
  );
}
