import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { ArrowLeft, Receipt } from "lucide-react";
import type { TimePoint } from "@shared/time-series";
import type { UserSettings } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { BillsDue } from "@/components/bills/bills-due";
import { BillsOverview } from "@/components/bills/bills-overview";
import { BillService } from "@/components/bills/bills-service";
import { BILL_NAV_BG, BILL_RULE, BILL_TONES } from "@/components/bills/bills-ui";
import { MONO, PAGE, SERIF } from "@/components/person/satchel";
import { useFitScale } from "@/hooks/use-fit-scale";
import { useToday } from "@/hooks/use-today";
import { mediaUrl } from "@/lib/agent-data";
import { queryKeys } from "@/lib/api";
import { attentionCount, checkSummary, groupBills, shortMoney, toBill } from "@/lib/bills";
import type { Bill } from "@/lib/bills";
import { FIT_SCALE_MIN } from "@/lib/fit-scale";
import { parseLocalDate } from "@/lib/format";
import { useHouseholdProfile } from "@/lib/household";
import { apiRequest } from "@/lib/queryClient";
import { timeSeriesKeys, useSeriesList } from "@/lib/time-series";
import { cn } from "@/lib/utils";

const TAG = "utilities";
const POINTS_OPTS = { limit: 400 } as const;

function pointsQuery(seriesId: string) {
  return {
    queryKey: timeSeriesKeys.points(seriesId, POINTS_OPTS),
    queryFn: () =>
      apiRequest<TimePoint[]>(
        "GET",
        `/api/metrics/series/${encodeURIComponent(seriesId)}/points?limit=${POINTS_OPTS.limit}`,
      ),
  };
}

const NAV_ITEM =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[15px] text-[#1a1612] dark:text-foreground";
const NAV_ACTIVE = "bg-[#f5f0e6] dark:bg-background font-semibold";

function headerDate(today: string): string {
  return parseLocalDate(today)
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn("ml-auto rounded-full px-2 text-xs font-semibold", BILL_TONES.check.badge)}
      data-testid="utilities-nav-badge"
    >
      {count}
    </span>
  );
}

function BillsNav({
  bills,
  footer,
  photoId,
  location,
  go,
}: {
  bills: Bill[];
  footer: string | null;
  photoId: string | undefined;
  location: string;
  go: (path: string) => void;
}) {
  const attention = attentionCount(bills);
  const groups = groupBills(bills);
  const needsLook = footer?.includes("need a look") ?? false;
  return (
    <nav
      className={cn("flex flex-col gap-3 border-b p-4 lg:border-b-0 lg:border-r", BILL_NAV_BG, BILL_RULE)}
      data-testid="utilities-nav"
    >
      {photoId && (
        <img
          src={mediaUrl(photoId)}
          alt="Our home"
          className="h-[150px] w-full rounded-lg object-cover"
          data-testid="utilities-nav-photo"
        />
      )}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className={cn(NAV_ITEM, location === "/" && NAV_ACTIVE)}
          onClick={() => go("/")}
          data-testid="utilities-nav-overview"
        >
          Overview
        </button>
        <button
          type="button"
          className={cn(NAV_ITEM, location === "/due" && NAV_ACTIVE)}
          onClick={() => go("/due")}
          data-testid="utilities-nav-due"
        >
          Due dates
          <NavBadge count={attention} />
        </button>
      </div>
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1" data-testid={`utilities-nav-group-${group.title}`}>
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[#a83818] dark:text-[#e07a52]">
            {group.title}
          </div>
          {group.items.map((bill) => {
            const path = `/${encodeURIComponent(bill.id)}`;
            const attn = bill.tone === "action" || bill.tone === "check";
            return (
              <button
                key={bill.id}
                type="button"
                className={cn(NAV_ITEM, location === path && NAV_ACTIVE)}
                onClick={() => go(path)}
                data-testid={`utilities-nav-bill-${bill.id}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: bill.color }} />
                <span className="truncate">{bill.what}</span>
                {bill.latest !== null && (
                  <span className={cn("ml-auto text-sm", MONO, attn ? BILL_TONES.action.ink : "text-[#5d5648] dark:text-muted-foreground", bill.tone === "check" && BILL_TONES.check.ink, bill.tone === "action" && "text-[#a83818] dark:text-[#e07a52]")}>
                    {shortMoney(bill.latest)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      {footer && (
        <div
          className="mt-auto flex items-center gap-2 pt-2 text-[13px] text-[#5d5648] dark:text-muted-foreground"
          data-testid="utilities-nav-footer"
        >
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", needsLook ? "bg-[#a83818] dark:bg-[#e07a52]" : "bg-[#2e5a3e] dark:bg-[#8fc49d]")}
          />
          {footer}
        </div>
      )}
    </nav>
  );
}

function Header({ title, today, line1 }: { title: string; today: string; line1: string | undefined }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 px-8 pb-2 pt-6" data-testid="utilities-header">
      <h1 className={cn("text-4xl font-semibold text-[#1a1612] dark:text-foreground", SERIF)}>{title}</h1>
      <div className={cn("text-xs uppercase tracking-[.08em] text-[#5d5648] dark:text-muted-foreground", MONO)}>
        {headerDate(today)}
        {line1 ? ` · ${line1}` : ""}
      </div>
    </header>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4 text-center py-8" data-testid="utilities-not-found">
      <p className="text-lg">We could not find that bill.</p>
      <Button type="button" variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Utilities
      </Button>
    </div>
  );
}

export default function UtilitiesPage() {
  const [location, navigate] = useLocation();
  const today = useToday();
  const fit = useFitScale<HTMLDivElement, HTMLDivElement>();
  const list = useSeriesList(TAG);
  const settings = useQuery<UserSettings>({ queryKey: queryKeys.settings() });
  const profile = useHouseholdProfile();

  const series = list.data ?? [];
  const pointResults = useQueries({ queries: series.map((s) => pointsQuery(s.id)) });
  const pointsKey = pointResults.map((r) => r.dataUpdatedAt).join(",");

  const bills = useMemo(
    () => series.map((s, i) => toBill(s, pointResults[i]?.data ?? [], today, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, pointsKey, today],
  );

  const go = (path: string) => navigate(path);
  const open = (id: string) => navigate(`/${encodeURIComponent(id)}`);
  const footer = list.data ? checkSummary(list.data, new Date()) : null;
  const line1 = profile.data?.address?.line1;

  const titleFor = (): string => {
    if (location === "/") return "Household bills";
    if (location === "/due") return "Due dates";
    let id = location.replace(/^\//, "");
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    return bills.find((b) => b.id === id)?.what ?? "Household bills";
  };

  if (list.isLoading) {
    return (
      <div className={cn("p-6 space-y-4", PAGE)} data-testid="page-utilities">
        <Skeleton className="h-12 w-72" data-testid="utilities-loading" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className={cn("h-full", PAGE)} data-testid="page-utilities">
        <EmptyState
          icon={Receipt}
          title="No bills yet"
          description='Bills appear here when an agent publishes time-series tagged "utilities" (see docs/time-series.md).'
        />
      </div>
    );
  }

  return (
    <div
      ref={fit.containerRef}
      className={cn("h-full", PAGE, fit.enabled && (fit.scale > FIT_SCALE_MIN ? "overflow-hidden" : "overflow-auto"))}
      data-testid="page-utilities"
    >
      <div
        ref={fit.contentRef}
        style={fit.contentStyle}
        className="grid grid-cols-1 lg:grid-cols-[256px_minmax(0,1fr)] lg:min-h-full"
      >
        <BillsNav
          bills={bills}
          footer={footer}
          photoId={settings.data?.utilitiesPhotoMediaId}
          location={location}
          go={go}
        />
        <main className="min-w-0 pb-8">
          <Header title={titleFor()} today={today} line1={line1} />
          <div className="px-8">
            <Switch>
              <Route path="/">
                <BillsOverview bills={bills} today={today} onOpen={open} onOpenDue={() => go("/due")} />
              </Route>
              <Route path="/due">
                <BillsDue bills={bills} today={today} onOpen={open} />
              </Route>
              <Route path="/:seriesId">
                {(params: { seriesId: string }) => {
                  let id = params.seriesId;
                  try {
                    id = decodeURIComponent(id);
                  } catch {
                    /* keep raw */
                  }
                  const bill = bills.find((b) => b.id === id);
                  return bill ? <BillService bill={bill} today={today} /> : <NotFound onBack={() => go("/")} />;
                }}
              </Route>
            </Switch>
          </div>
        </main>
      </div>
    </div>
  );
}
