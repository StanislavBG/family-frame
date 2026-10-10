import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Database,
  Image,
  LayoutDashboard,
  Mail,
  PanelLeft,
  PanelLeftClose,
  UserRound,
} from "lucide-react";
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
import PersonDashboard from "@/components/person/person-dashboard";
import PersonCalendar from "@/components/person/person-calendar";
import PersonInbox from "@/components/person/person-inbox";
import PersonPhotos from "@/components/person/person-photos";
import PersonSheets from "@/components/person/person-sheets";
import PersonMore from "@/components/person/person-more";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, Component: PersonDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays, Component: PersonCalendar },
  { id: "inbox", label: "Inbox", icon: Mail, Component: PersonInbox },
  { id: "photos", label: "Photos", icon: Image, Component: PersonPhotos },
  { id: "sheets", label: "Sheets", icon: ClipboardList, Component: PersonSheets },
  { id: "more", label: "More", icon: Database, Component: PersonMore },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Which tabs have data for this person. Dashboard and Calendar are always visible. */
function usePersonTabs(personId: string): TabId[] {
  const mail = useMailMessages({ personId, limit: 1 });
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
  return tabs;
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

function navItemClass(isActive: boolean, collapsed: boolean) {
  return cn(
    "w-full flex items-center rounded-md text-left text-base transition-all duration-200",
    collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3",
    isActive
      ? "bg-primary/10 text-primary font-medium"
      : "hover-elevate text-muted-foreground hover:text-foreground",
  );
}

/** Second-level left menu, same pattern as Global Config: person picker, then sections. */
function PersonView({ person, people, tab }: { person: Person; people: Person[]; tab?: string }) {
  const visible = usePersonTabs(person.id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const visibleTabs = TABS.filter((t) => visible.includes(t.id) || t.id === active.id);
  const Active = active.Component;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const personBase = (p: Person) => `/${encodeURIComponent(p.id)}`;

  const renderPeople = (collapsed: boolean) =>
    people.length > 1 && (
      <div className="space-y-1" role="list" aria-label="Family members">
        {people.map((p) => {
          const isActive = p.id === person.id;
          return (
            <Link
              key={p.id}
              // Keep the current section when switching person; hidden-empty sections fall back to Dashboard.
              href={`${personBase(p)}/${active.id}`}
              role="listitem"
              onClick={() => setMobileNavOpen(false)}
              className={navItemClass(isActive, collapsed)}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? p.name : undefined}
              data-testid={`nav-person-${p.id}`}
            >
              <UserRound className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{p.name}</span>}
            </Link>
          );
        })}
      </div>
    );

  const renderSections = (collapsed: boolean) => (
    <nav className="space-y-1" aria-label={`${person.name} sections`}>
      {visibleTabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.id === active.id;
        return (
          <Link
            key={t.id}
            href={`${personBase(person)}/${t.id}`}
            onClick={() => setMobileNavOpen(false)}
            className={navItemClass(isActive, collapsed)}
            aria-current={isActive ? "page" : undefined}
            aria-label={`${t.label} section`}
            title={collapsed ? t.label : undefined}
            data-testid={`tab-person-${t.id}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{t.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const backButton = (
    <Button asChild variant="ghost" size="icon" className="shrink-0">
      <Link href="/" aria-label="Back to people" data-testid="button-people-back">
        <ArrowLeft className="h-5 w-5" />
      </Link>
    </Button>
  );

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {backButton}
          <h1 className="text-lg font-semibold truncate" data-testid="text-person-name">
            {person.name}
          </h1>
        </div>
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

      {/* Mobile Nav Dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden border-b bg-background p-4 space-y-3">
          {renderPeople(false)}
          {people.length > 1 && <div className="border-t" />}
          {renderSections(false)}
        </div>
      )}

      {/* Left Navigation Panel - Desktop */}
      <div
        className={cn(
          "hidden md:flex flex-col border-r bg-muted/30 shrink-0 transition-all duration-300",
          sidebarCollapsed ? "w-14" : "w-60",
        )}
      >
        <div
          className={cn(
            "border-b flex items-center transition-all duration-300",
            sidebarCollapsed ? "p-2 justify-center" : "p-4 gap-2",
          )}
        >
          {backButton}
          {!sidebarCollapsed && (
            <h1 className="text-xl font-semibold truncate" data-testid="text-person-name-desktop">
              {person.name}
            </h1>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className={cn("space-y-3 transition-all duration-300", sidebarCollapsed ? "p-2" : "p-4")}>
            {renderPeople(sidebarCollapsed)}
            {people.length > 1 && <div className="border-t" />}
            {renderSections(sidebarCollapsed)}
          </div>
        </ScrollArea>

        <div className={cn("border-t transition-all duration-300", sidebarCollapsed ? "p-2" : "p-4")}>
          <Button
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn("w-full", sidebarCollapsed && "justify-center")}
            data-testid="button-toggle-person-sidebar"
            title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto" role="region" aria-label={`${person.name} ${active.label}`}>
        <Active person={person} />
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
