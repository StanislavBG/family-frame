import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, BedDouble, CalendarX, Car, Compass, ExternalLink, MapPin, Moon, Utensils, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { EventActions } from "@/components/events/event-actions";
import { LINE, MUTED, SATCHEL_TONES, SectionLabel, SERIF, SURFACE, ToneChip, type SatchelTone } from "@/components/person/satchel";
import { useFitScale } from "@/hooks/use-fit-scale";
import { buildEventFacts, distanceText, hasMapLocation, mapUrl, whereSummary } from "@/lib/event-detail";
import { cn } from "@/lib/utils";
import type { Trip } from "@shared/events";
import {
  CATEGORY_META,
  formatClock,
  formatCost,
  formatWhen,
  statusBadge,
  tripBadge,
  useEventItem,
  useMarkSeen,
} from "@/lib/events";

const CARD = cn("rounded-2xl border p-4", SURFACE, LINE);
const LINK = cn("inline-flex min-h-11 items-center gap-1 text-base font-semibold underline underline-offset-2", SATCHEL_TONES.sky.fg);
const BODY = "text-base leading-relaxed text-[#1a1612] dark:text-foreground";
const ACTION_PILL = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm lg:text-base font-semibold";
const HEADER_FACTS = new Set(["When", "Where", "Distance", "Cost"]);

function sourceLabel(s: { url: string; publisher?: string; title?: string }): string {
  if (s.publisher) return s.publisher;
  if (s.title) return s.title;
  try {
    return new URL(s.url).hostname;
  } catch {
    return s.url;
  }
}


function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-5", BODY)}>
      {items.map((line, i) => (
        <li key={`${i}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}

function dateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  }
}

function ExternalAnchor({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK} data-testid={testId}>
      {children}
      <ExternalLink className="h-4 w-4 flex-none" aria-hidden />
    </a>
  );
}

const ADMISSION_BADGE: Record<string, { label: string; tone: SatchelTone }> = {
  free: { label: "Free", tone: "leaf" },
  donation: { label: "Donation", tone: "sun" },
  "paid-entry": { label: "Paid entry", tone: "sky" },
  ticketed: { label: "Ticketed", tone: "plum" },
};

function admissionBadge(cost: { isFree: boolean; admission?: string }): { label: string; tone: SatchelTone } {
  return ADMISSION_BADGE[cost.admission ?? (cost.isFree ? "free" : "paid-entry")] ?? ADMISSION_BADGE["paid-entry"];
}

type TripItem = Trip["itinerary"][number]["items"][number];

const ITEM_KIND: Record<TripItem["kind"], { label: string; tone: SatchelTone; Icon: LucideIcon }> = {
  drive: { label: "Drive", tone: "stone", Icon: Car },
  activity: { label: "Activity", tone: "leaf", Icon: Compass },
  meal: { label: "Meal", tone: "sun", Icon: Utensils },
  rest: { label: "Rest", tone: "sky", Icon: Moon },
  lodging: { label: "Stay", tone: "plum", Icon: BedDouble },
  other: { label: "Other", tone: "stone", Icon: Compass },
};

function TripPlan({ trip }: { trip: Trip }) {
  return (
    <section className={cn(CARD, "space-y-3")} data-testid="section-trip-plan">
      <h2 className={cn(SERIF, "text-xl font-bold", SATCHEL_TONES.sky.fg)}>Plan for the trip</h2>
      {trip.bestFor && <p className={BODY}>{trip.bestFor}</p>}
      {trip.itinerary.map((day, d) => (
        <div key={`${d}-${day.label}`} className="space-y-2" data-testid="trip-day">
          <h3 className={cn(SERIF, "text-lg font-bold text-[#1a1612] dark:text-foreground")}>{day.label}</h3>
          <ol className="space-y-2">
            {day.items.map((it, i) => {
              const kind = ITEM_KIND[it.kind];
              return (
                <li key={`${i}-${it.title}`} className={cn("flex gap-3 rounded-xl p-3", SATCHEL_TONES[kind.tone].bg)} data-testid="trip-item">
                  <kind.Icon className={cn("mt-1 h-5 w-5 flex-none", SATCHEL_TONES[kind.tone].fg)} aria-label={kind.label} role="img" />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-base font-semibold", SATCHEL_TONES[kind.tone].fg)}>
                      {it.time && <span className="mr-2">{formatClock(it.time)}</span>}
                      <span className="text-[#1a1612] dark:text-foreground">{it.title}</span>
                    </div>
                    {it.notes && <p className={cn(BODY, "leading-snug")}>{it.notes}</p>}
                    {it.url && <ExternalAnchor href={it.url}>Open link</ExternalAnchor>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

function TripLodging({ trip }: { trip: Trip }) {
  if (trip.lodging.length === 0) return null;
  return (
    <section className={cn(CARD, "space-y-3")} data-testid="section-trip-lodging">
      <h2 className={cn(SERIF, "text-xl font-bold", SATCHEL_TONES.plum.fg)}>Where to stay</h2>
      <p className={cn("text-sm font-semibold", MUTED)}>Ideas we found – check prices and book directly.</p>
      <ul className="space-y-2">
        {trip.lodging.map((l, i) => (
          <li key={`${i}-${l.name}`} className={cn("rounded-xl border p-3", LINE)} data-testid="trip-lodging">
            <div className="text-base font-bold text-[#1a1612] dark:text-foreground">{l.name}</div>
            <div className={cn("text-base", MUTED)}>{l.area}</div>
            <div className={cn("text-base font-semibold", SATCHEL_TONES.plum.fg)}>{l.priceText}</div>
            {l.notes && <p className={cn(BODY, "leading-snug")}>{l.notes}</p>}
            <ExternalAnchor href={l.url}>View listing</ExternalAnchor>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-testid="event-hero-skeleton" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className={cn("inline-flex min-h-11 items-center gap-1 text-base font-semibold", SATCHEL_TONES.sky.fg)} data-testid="link-event-back">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to events
    </Link>
  );
}

export function EventHero({ eventId }: { eventId: string }) {
  const { data: item, isLoading, error } = useEventItem(eventId);
  const markSeen = useMarkSeen(eventId);
  const markedFor = useRef<string | null>(null);
  // Wall displays: scale the whole page to fit one screen instead of scrolling.
  const fit = useFitScale<HTMLDivElement, HTMLElement>();

  const unseen = item?.hasUnseenUpdate === true;
  useEffect(() => {
    if (unseen && markedFor.current !== eventId) {
      markedFor.current = eventId;
      markSeen.mutate();
    }
    // markSeen identity changes each render; the ref guards against repeats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, eventId]);

  if (isLoading) return <HeroSkeleton />;

  if (!item) {
    const notFound = error instanceof Error && error.message.startsWith("404");
    return (
      <div data-testid="event-hero-missing">
        <EmptyState
          icon={CalendarX}
          title={notFound ? "Event not found" : "Couldn't load this event"}
          description={notFound ? "This event is no longer on your list." : "Please go back and try again."}
        >
          <BackLink />
        </EmptyState>
      </div>
    );
  }

  const { event, rec } = item;
  const category = CATEGORY_META[event.category];
  const tone = SATCHEL_TONES[category.tone];
  const badge = statusBadge(event.status, event.updates);
  const cancelled = event.status === "cancelled";
  const distance = distanceText(rec);
  const updates = [...event.updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const showBanner = !!badge || !!event.statusNote || updates.length > 0;
  const { location, cost, organizer } = event;
  const facts = buildEventFacts(event, rec).filter((f) => !HEADER_FACTS.has(f.label));
  const tripLabel = tripBadge(item);
  const admission = admissionBadge(cost);
  const hasMap = hasMapLocation(location);
  const actions: { href: string; label: string; testId?: string; Icon?: LucideIcon }[] = [
    ...(hasMap ? [{ href: mapUrl(location), label: "Google Maps", testId: "link-event-map", Icon: MapPin }] : []),
    ...(cost.ticketUrl ? [{ href: cost.ticketUrl, label: "Buy tickets", testId: "link-event-tickets" }] : []),
    ...(cost.registrationUrl ? [{ href: cost.registrationUrl, label: "Register", testId: "link-event-registration" }] : []),
    ...(organizer?.url ? [{ href: organizer.url, label: "Organizer website" }] : []),
  ];

  return (
    <div
      ref={fit.containerRef}
      className="h-full overflow-y-auto"
      data-testid="event-hero-fit"
    >
      <article
        ref={fit.contentRef}
        style={fit.contentStyle}
        className="space-y-3 p-4"
        data-testid={`event-hero-${item.eventId}`}
        data-fit-scale={fit.scale}
      >
        <div>
          <BackLink />
        </div>
        <header className={cn("space-y-3 rounded-2xl p-4", tone.bg)} data-testid="event-hero-header">
          <div className="flex flex-wrap items-center gap-2">
            <ToneChip tone={category.tone} className="bg-[#fffaf0]/70 dark:bg-background/40" data-testid="chip-event-category">
              {category.label}
            </ToneChip>
            {badge && (
              <ToneChip tone={badge.tone} data-testid="chip-event-status">
                {badge.label}
              </ToneChip>
            )}
            {tripLabel && (
              <ToneChip tone="sky" className="bg-[#fffaf0]/70 dark:bg-background/40" data-testid="chip-event-trip">
                {tripLabel}
              </ToneChip>
            )}
            <ToneChip tone={admission.tone} className="bg-[#fffaf0]/70 dark:bg-background/40" data-testid="chip-event-admission">
              {admission.label}
            </ToneChip>
          </div>
          <h1 className={cn(SERIF, "text-2xl font-bold leading-tight lg:text-3xl", tone.fg)} data-testid="text-event-title">
            {event.title}
          </h1>
          <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-base font-semibold", tone.fg)}>
            <span data-testid="text-event-when">{formatWhen(event.schedule)}</span>
            <span className="inline-flex items-start gap-1" data-testid="event-where-summary">
              <MapPin className="mt-1 h-4 w-4 flex-none" aria-hidden />
              {hasMap ? (
                <a
                  href={mapUrl(location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                  data-testid="link-event-where-map"
                >
                  {whereSummary(location)}
                </a>
              ) : (
                whereSummary(location)
              )}
            </span>
            {item.closeToHome === true && (
              <span className="inline-flex items-center gap-1.5" data-testid="event-hero-close">
                <ToneChip tone="leaf" className="bg-[#fffaf0]/70 dark:bg-background/40">
                  Close to home
                </ToneChip>
                {rec.distanceKm !== undefined && <span>· {rec.distanceKm.toFixed(1)} km</span>}
              </span>
            )}
            {distance && !(item.closeToHome === true && rec.distanceKm !== undefined) && (
              <span data-testid="text-event-distance">{distance}</span>
            )}
            <span data-testid="text-event-cost">{formatCost(cost)}</span>
          </div>
          <p className={BODY}>{event.summary}</p>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="event-primary-actions">
              {actions.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(ACTION_PILL, SURFACE, LINE, SATCHEL_TONES.sky.fg)}
                  data-testid={a.testId}
                >
                  {a.Icon ? <a.Icon className="h-4 w-4 flex-none" aria-hidden /> : null}
                  {a.label}
                  {!a.Icon && <ExternalLink className="h-4 w-4 flex-none" aria-hidden />}
                </a>
              ))}
            </div>
          )}
        </header>

        <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-3 lg:space-y-0">
          <div className="space-y-3">
            <EventActions item={item} />
            {showBanner && (
              <section
                className={cn("space-y-2 rounded-2xl border p-4", cancelled ? cn(SATCHEL_TONES.clay.bg, "border-[#a83818] dark:border-[#e07a52]") : cn(SURFACE, LINE))}
                role={cancelled ? "alert" : undefined}
                data-testid="event-status-banner"
              >
                {(badge || event.statusNote) && (
                  <div className="space-y-1">
                    {badge && (
                      <h2 className={cn(SERIF, "text-xl font-bold", cancelled ? SATCHEL_TONES.clay.fg : SATCHEL_TONES[badge.tone].fg)}>
                        {badge.label}
                      </h2>
                    )}
                    {event.statusNote && (
                      <p className={cn(BODY, cancelled && "font-semibold")} data-testid="text-event-status-note">
                        {event.statusNote}
                      </p>
                    )}
                  </div>
                )}
                {updates.length > 0 && (
                  <div className="space-y-2">
                    <SectionLabel>Changes</SectionLabel>
                    <ol className="space-y-2" data-testid="list-event-updates">
                      {updates.map((u, i) => (
                        <li key={`${u.at}-${i}`} className={cn("border-l-2 pl-3", LINE)}>
                          <div className={cn("text-sm font-semibold", MUTED)}>
                            {dateTime(u.at, event.schedule.timezone)} · {u.kind.replace(/-/g, " ")}
                          </div>
                          <p className={BODY}>{u.summary}</p>
                          {(u.before || u.after) && (
                            <p className={cn("text-sm", MUTED)}>
                              {u.before && <span className="line-through">{u.before}</span>}
                              {u.before && u.after && " → "}
                              {u.after && <span className="font-semibold">{u.after}</span>}
                            </p>
                          )}
                          {u.sourceUrl && <ExternalAnchor href={u.sourceUrl}>Source</ExternalAnchor>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}
          </div>

          <section className={cn(CARD, "space-y-3")} data-testid="section-why-household">
            <h2 className={cn(SERIF, "text-lg font-bold", SATCHEL_TONES.leaf.fg)}>Why it suits your household</h2>
            <p className={BODY}>{rec.whyForHousehold}</p>
            {rec.matchReasons.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="list-match-reasons">
                {rec.matchReasons.map((r, i) => (
                  <ToneChip key={`${i}-${r}`} tone="leaf">
                    {r}
                  </ToneChip>
                ))}
              </div>
            )}
            {rec.whyForChildren && (
              <div className="space-y-1" data-testid="section-why-children">
                <h2 className={cn(SERIF, "text-lg font-bold", SATCHEL_TONES.clay.fg)}>Why the kids will love it</h2>
                <p className={BODY}>{rec.whyForChildren}</p>
              </div>
            )}
            {(rec.highlights.length > 0 || rec.tips.length > 0) && (
              <div className="space-y-1" data-testid="section-highlights">
                <h2 className={cn(SERIF, "text-lg font-bold text-[#1a1612] dark:text-foreground")}>Highlights</h2>
                {rec.highlights.length > 0 && <BulletList items={rec.highlights} />}
                {rec.tips.length > 0 && <BulletList items={rec.tips} />}
              </div>
            )}
          </section>

          <section className={cn(CARD, "space-y-3")} data-testid="section-details">
            <h2 className={cn(SERIF, "text-lg font-bold text-[#1a1612] dark:text-foreground")}>Details</h2>
            {facts.length > 0 && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                {facts.map((row) => (
                  <div key={row.label} className="contents">
                    <dt><SectionLabel>{row.label}</SectionLabel></dt>
                    <dd className={cn(BODY, "leading-snug")}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {event.sources.length > 0 && (
              <div className="space-y-1">
                <SectionLabel>Sources</SectionLabel>
                <ul className="space-y-1" data-testid="list-event-sources">
                  {event.sources.map((s) => (
                    <li key={s.url} className="min-w-0">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("block min-h-11 truncate py-2 text-sm font-semibold", MUTED)}
                      >
                        {sourceLabel(s)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
        {rec.trip && (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
            <TripPlan trip={rec.trip} />
            <TripLodging trip={rec.trip} />
          </div>
        )}
      </article>
    </div>
  );
}
