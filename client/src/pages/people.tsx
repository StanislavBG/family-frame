import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, UserRound } from "lucide-react";
import type { Person } from "@shared/schema";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import PersonDashboard from "@/components/person/person-dashboard";
import PersonCalendar from "@/components/person/person-calendar";
import PersonInbox from "@/components/person/person-inbox";
import PersonPhotos from "@/components/person/person-photos";
import PersonSheets from "@/components/person/person-sheets";
import PersonMore from "@/components/person/person-more";

const TABS = [
  { id: "dashboard", label: "Dashboard", Component: PersonDashboard },
  { id: "calendar", label: "Calendar", Component: PersonCalendar },
  { id: "inbox", label: "Inbox", Component: PersonInbox },
  { id: "photos", label: "Photos", Component: PersonPhotos },
  { id: "sheets", label: "Sheets", Component: PersonSheets },
  { id: "more", label: "More", Component: PersonMore },
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

function PersonView({ person, tab }: { person: Person; tab?: string }) {
  const visible = usePersonTabs(person.id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const visibleTabs = TABS.filter((t) => visible.includes(t.id) || t.id === active.id);
  const Active = active.Component;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 p-6 pb-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/" aria-label="Back to people" data-testid="button-people-back">
            <ArrowLeft className="h-6 w-6" />
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold" data-testid="text-person-name">
          {person.name}
        </h1>
      </div>
      <nav
        role="tablist"
        aria-label={`${person.name} sections`}
        className="flex gap-2 px-6 py-2 overflow-x-auto border-b"
      >
        {visibleTabs.map((t) => (
          <Button
            key={t.id}
            asChild
            variant={t.id === active.id ? "default" : "ghost"}
            size="lg"
          >
            <Link
              href={`/${encodeURIComponent(person.id)}/${t.id}`}
              role="tab"
              aria-selected={t.id === active.id}
              aria-label={`${t.label} tab`}
              data-testid={`tab-person-${t.id}`}
            >
              {t.label}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
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
    return <PersonView person={person} tab={params.tab} />;
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
