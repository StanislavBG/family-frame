import { Link } from "wouter";
import { audienceGroup, signUpUrl, type AudienceGroup } from "@shared/events-activity";
import { LINE, MUTED, SATCHEL_TONES, SERIF, SURFACE, ToneChip } from "@/components/person/satchel";
import { CATEGORY_META, formatCost, formatWhen, type EventItem } from "@/lib/events";
import { cn } from "@/lib/utils";

const GROUPS: { id: AudienceGroup; label: string }[] = [
  { id: "kids", label: "For the kids" },
  { id: "adults", label: "For grown-ups" },
  { id: "everyone", label: "For all of us" },
];

export function classSchedule(item: EventItem): string {
  const { schedule } = item.event;
  return schedule.recurrenceText?.trim() || formatWhen(schedule, "12h");
}

function ClassCard({ item }: { item: EventItem }) {
  const { event } = item;
  const cat = CATEGORY_META[event.category];
  const url = signUpUrl(event);
  return (
    <div
      className={cn("flex min-h-16 flex-col gap-1.5 rounded-2xl border p-3", SURFACE, LINE)}
      data-testid={`events-class-${item.eventId}`}
    >
      <Link
        href={`/${encodeURIComponent(item.eventId)}`}
        className={cn(SERIF, "line-clamp-2 min-h-11 text-base font-bold leading-snug text-[#1a1612] dark:text-foreground")}
      >
        {event.title}
      </Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ToneChip tone={cat.tone}>{cat.label}</ToneChip>
        {item.closeToHome === true && <ToneChip tone="leaf">Close to home</ToneChip>}
      </div>
      <p className={cn("text-sm", MUTED)}>
        <span data-testid={`events-class-when-${item.eventId}`}>{classSchedule(item)}</span>
        {` · ${formatCost(event.cost)}`}
      </p>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center self-start rounded-full border px-4 text-base font-semibold"
          data-testid={`events-class-signup-${item.eventId}`}
        >
          Sign up
        </a>
      )}
    </div>
  );
}

export function EventsClassesShelf({
  items,
  limit,
  onShowAll,
}: {
  items: EventItem[];
  limit?: number;
  onShowAll?: () => void;
}) {
  if (items.length === 0) return null;
  const capped = limit !== undefined && items.length > limit;
  const shown = capped ? items.slice(0, Math.max(0, limit)) : items;
  return (
    <section aria-labelledby="events-classes" className="space-y-3" data-testid="events-classes">
      <h2 id="events-classes" className={cn(SERIF, "text-2xl font-bold", SATCHEL_TONES.sky.fg)}>
        Classes and sign-ups
      </h2>
      {GROUPS.map((g) => {
        const rows = shown.filter((i) => audienceGroup(i.event) === g.id);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="space-y-2" data-testid={`events-classes-${g.id}`}>
            <h3 className={cn(SERIF, "text-lg font-bold", MUTED)}>{g.label}</h3>
            <div className="grid gap-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((item) => (
                <ClassCard key={item.eventId} item={item} />
              ))}
            </div>
          </div>
        );
      })}
      {capped && onShowAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="min-h-11 rounded-full border px-4 text-base font-semibold"
          data-testid="events-classes-all"
        >
          {`See all ${items.length}`}
        </button>
      )}
    </section>
  );
}
