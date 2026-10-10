import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarX, ExternalLink, MapPin, Ticket } from "lucide-react";
import type { FfEvent } from "@shared/events";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { EventActions } from "@/components/events/event-actions";
import { LINE, MUTED, SATCHEL_TONES, SectionLabel, SERIF, SURFACE, ToneChip } from "@/components/person/satchel";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  formatCost,
  formatWhen,
  statusBadge,
  useEventItem,
  useMarkSeen,
  type EventItem,
} from "@/lib/events";

const CARD = cn("rounded-2xl border p-4 sm:p-5", SURFACE, LINE);
const LINK = cn("inline-flex min-h-11 items-center gap-1 text-base font-semibold underline underline-offset-2", SATCHEL_TONES.sky.fg);
const BODY = "text-base leading-relaxed text-[#1a1612] dark:text-foreground";

const AGE_LABELS: Record<FfEvent["audience"]["ageBands"][number], string> = {
  baby: "Babies",
  toddler: "Toddlers",
  preschool: "Preschool",
  "school-age": "School age",
  teen: "Teens",
  adult: "Adults",
  senior: "Seniors",
  "all-ages": "All ages",
};

const SETTING_LABELS: Record<FfEvent["location"]["setting"], string | null> = {
  indoor: "Indoors",
  outdoor: "Outdoors",
  mixed: "Indoors and outdoors",
  unknown: null,
};

function Section({ title, tone, testId, children }: { title: string; tone?: keyof typeof SATCHEL_TONES; testId: string; children: React.ReactNode }) {
  return (
    <section className={cn(CARD, "space-y-3")} data-testid={testId}>
      <h2 className={cn(SERIF, "text-xl font-bold", tone ? SATCHEL_TONES[tone].fg : "text-[#1a1612] dark:text-foreground")}>{title}</h2>
      {children}
    </section>
  );
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

function mapUrl(location: FfEvent["location"]): string {
  const query = [location.venueName, location.address, location.city, location.region, location.postalCode, location.country]
    .filter(Boolean)
    .join(", ");
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

function distanceText(item: EventItem): string | null {
  const { distanceKm, travelMinutes } = item.rec;
  const parts: string[] = [];
  if (distanceKm !== undefined) parts.push(`${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km away`);
  if (travelMinutes !== undefined) parts.push(`${travelMinutes} min`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function ExternalAnchor({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK} data-testid={testId}>
      {children}
      <ExternalLink className="h-4 w-4 flex-none" aria-hidden />
    </a>
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
    <Link href="/events" className={cn("inline-flex min-h-11 items-center gap-1 text-base font-semibold", SATCHEL_TONES.sky.fg)} data-testid="link-event-back">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to events
    </Link>
  );
}

export function EventHero({ eventId }: { eventId: string }) {
  const { data: item, isLoading, error } = useEventItem(eventId);
  const markSeen = useMarkSeen(eventId);
  const markedFor = useRef<string | null>(null);

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
  const distance = distanceText(item);
  const updates = [...event.updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const showBanner = !!badge || !!event.statusNote || updates.length > 0;
  const setting = SETTING_LABELS[event.location.setting];
  const { audience, location, cost, organizer } = event;
  const ageText = [
    audience.ageBands.map((b) => AGE_LABELS[b]).join(", "),
    audience.ageMin !== undefined || audience.ageMax !== undefined
      ? `ages ${audience.ageMin ?? 0}${audience.ageMax !== undefined ? `–${audience.ageMax}` : "+"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const goodToKnow: { label: string; value: string }[] = [
    ...(ageText ? [{ label: "Ages", value: ageText }] : []),
    ...(setting ? [{ label: "Setting", value: setting }] : []),
    ...(audience.strollerFriendly ? [{ label: "Strollers", value: "Stroller friendly" }] : []),
    ...(location.accessibilityNotes ? [{ label: "Accessibility", value: location.accessibilityNotes }] : []),
    ...(location.parkingNotes ? [{ label: "Parking", value: location.parkingNotes }] : []),
  ];
  const ticketLinks = [
    ...(cost.ticketUrl ? [{ href: cost.ticketUrl, label: "Buy tickets", testId: "link-event-tickets" }] : []),
    ...(cost.registrationUrl ? [{ href: cost.registrationUrl, label: "Register", testId: "link-event-registration" }] : []),
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-4 p-4" data-testid={`event-hero-${item.eventId}`}>
      <BackLink />

      <header className={cn("space-y-3 rounded-2xl p-5 sm:p-6", tone.bg)} data-testid="event-hero-header">
        <div className="flex flex-wrap items-center gap-2">
          <ToneChip tone={category.tone} className="bg-[#fffaf0]/70 dark:bg-background/40" data-testid="chip-event-category">
            {category.label}
          </ToneChip>
          {badge && (
            <ToneChip tone={badge.tone} data-testid="chip-event-status">
              {badge.label}
            </ToneChip>
          )}
        </div>
        <h1 className={cn(SERIF, "text-3xl font-bold leading-tight sm:text-4xl", tone.fg)} data-testid="text-event-title">
          {event.title}
        </h1>
        <p className={cn("text-lg font-semibold", tone.fg)} data-testid="text-event-when">
          {formatWhen(event.schedule)}
        </p>
        <p className={cn("flex flex-wrap gap-x-4 gap-y-1 text-base font-semibold", tone.fg)}>
          {distance && <span data-testid="text-event-distance">{distance}</span>}
          <span data-testid="text-event-cost">{formatCost(cost)}</span>
        </p>
        <p className={BODY}>{event.summary}</p>
      </header>

      <EventActions item={item} />

      {showBanner && (
        <section
          className={cn("space-y-3 rounded-2xl border p-4 sm:p-5", cancelled ? cn(SATCHEL_TONES.clay.bg, "border-[#a83818] dark:border-[#e07a52]") : cn(SURFACE, LINE))}
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
              <ol className="space-y-3" data-testid="list-event-updates">
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
                    {u.sourceUrl && (
                      <ExternalAnchor href={u.sourceUrl}>Source</ExternalAnchor>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <Section title="Why it suits your household" tone="leaf" testId="section-why-household">
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
      </Section>

      {rec.whyForChildren && (
        <Section title="Why the kids will love it" tone="clay" testId="section-why-children">
          <p className={BODY}>{rec.whyForChildren}</p>
        </Section>
      )}

      {rec.highlights.length > 0 && (
        <Section title="Highlights" testId="section-highlights">
          <BulletList items={rec.highlights} />
        </Section>
      )}

      {(rec.tips.length > 0 || goodToKnow.length > 0) && (
        <Section title="Good to know" testId="section-good-to-know">
          {rec.tips.length > 0 && <BulletList items={rec.tips} />}
          {goodToKnow.length > 0 && (
            <dl className="space-y-2">
              {goodToKnow.map((row) => (
                <div key={row.label}>
                  <dt><SectionLabel>{row.label}</SectionLabel></dt>
                  <dd className={BODY}>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      )}

      <Section title="Where" testId="section-where">
        <div className={cn("flex items-start gap-2", BODY)}>
          <MapPin className="mt-1 h-4 w-4 flex-none" aria-hidden />
          <div>
            {location.online && <div className="font-semibold">Online event</div>}
            {location.venueName && <div className="font-semibold">{location.venueName}</div>}
            {location.address && <div>{location.address}</div>}
            <div>{[location.city, location.region, location.postalCode].filter(Boolean).join(", ")}</div>
            <div>{location.country}</div>
            {distance && <div className={cn("text-sm", MUTED)}>{distance}</div>}
          </div>
        </div>
        <ExternalAnchor href={mapUrl(location)} testId="link-event-map">Open map</ExternalAnchor>
      </Section>

      <Section title="Tickets" testId="section-tickets">
        <p className={BODY}>
          {formatCost(cost)}
          {cost.priceText && !cost.isFree && cost.priceText !== formatCost(cost) ? ` · ${cost.priceText}` : ""}
        </p>
        <div className={cn("flex flex-wrap gap-x-4 text-sm font-semibold", MUTED)}>
          {cost.ticketRequired && (
            <span className="inline-flex items-center gap-1"><Ticket className="h-4 w-4" aria-hidden />Ticket required</span>
          )}
          {cost.registrationRequired && <span>Registration required</span>}
        </div>
        {ticketLinks.length > 0 && (
          <div className="flex flex-wrap gap-x-4">
            {ticketLinks.map((l) => (
              <ExternalAnchor key={l.href} href={l.href} testId={l.testId}>{l.label}</ExternalAnchor>
            ))}
          </div>
        )}
      </Section>

      {organizer && (
        <Section title="Organizer" testId="section-organizer">
          <p className={cn(BODY, "font-semibold")}>{organizer.name}</p>
          {organizer.contact && <p className={BODY}>{organizer.contact}</p>}
          {organizer.url && <ExternalAnchor href={organizer.url}>Organizer website</ExternalAnchor>}
        </Section>
      )}

      <Section title="Sources" testId="section-sources">
        <ul className="space-y-1">
          {event.sources.map((s) => (
            <li key={s.url}>
              <ExternalAnchor href={s.url}>
                {[s.publisher, s.title].filter(Boolean).join(" – ") || s.url}
              </ExternalAnchor>
            </li>
          ))}
        </ul>
      </Section>

      <div className="hidden [@media(min-height:900px)]:block" data-testid="event-actions-bottom">
        <EventActions item={item} />
      </div>
    </article>
  );
}
