import { useMemo } from "react";
import { Link } from "wouter";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { DOW_TONES, LINE, SATCHEL_TONES, SERIF, SURFACE } from "@/components/person/satchel";
import { useToday } from "@/hooks/use-today";
import { CATEGORY_META, dateKeyInZone, type EventItem } from "@/lib/events";
import { buildMonthCells, WEEKDAY_SHORT as WEEKDAY } from "@/lib/person-day";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 3;

interface EventsMonthProps {
  items: EventItem[];
  /** Any YYYY-MM-DD (or YYYY-MM) inside the month to show. */
  monthIso: string;
  /** Called with the first day (YYYY-MM-01) of the newly selected month. */
  onMonthChange: (monthIso: string) => void;
  weekStartsMonday: boolean;
}

function parseMonth(monthIso: string): { year: number; month: number } {
  const [y, m] = monthIso.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function monthKey(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function occurrenceDates(item: EventItem): string[] {
  const { schedule } = item.event;
  const starts = schedule.occurrences.length > 0 ? schedule.occurrences.map((o) => o.start) : [schedule.start];
  return Array.from(new Set(starts.map((s) => dateKeyInZone(s, schedule.timezone))));
}

function EventChip({ item }: { item: EventItem }) {
  const tone = SATCHEL_TONES[CATEGORY_META[item.event.category].tone];
  const cancelled = item.event.status === "cancelled";
  const { title } = item.event;
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      className={cn(
        "flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold",
        tone.bg,
        tone.fg,
        cancelled && "line-through",
      )}
      aria-label={`${title}${item.response === "going" ? ", going" : item.response === "interested" ? ", interested" : ""}${cancelled ? ", cancelled" : ""}${item.hasUnseenUpdate ? ", changed" : ""}`}
      data-testid={`events-month-chip-${item.eventId}`}
    >
      {item.response === "going" && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {item.response === "interested" && <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {item.hasUnseenUpdate && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-[10px] font-bold uppercase no-underline"
          data-testid={`events-month-changed-${item.eventId}`}
        >
          <span className="h-2 w-2 rounded-full bg-[#a83818] dark:bg-[#e07a52]" aria-hidden />
          Changed
        </span>
      )}
    </Link>
  );
}

export function EventsMonth({ items, monthIso, onMonthChange, weekStartsMonday }: EventsMonthProps) {
  const todayIso = useToday();
  const { year, month } = parseMonth(monthIso);
  const cells = buildMonthCells(year, month, weekStartsMonday);

  const byDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const item of items) {
      for (const date of occurrenceDates(item)) {
        const list = map.get(date);
        if (list) list.push(item);
        else map.set(date, [item]);
      }
    }
    return map;
  }, [items]);

  const headers = weekStartsMonday ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const navButton = "flex h-11 w-11 items-center justify-center rounded-full border";
  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className={cn("rounded-3xl border p-4", SURFACE, LINE)} data-testid="events-month">
      <header className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className={cn(navButton, SURFACE, LINE)}
          onClick={() => onMonthChange(monthKey(year, month - 1))}
          aria-label="Previous month"
          data-testid="events-month-prev"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className={cn(SERIF, "text-2xl font-bold")} data-testid="events-month-title">
          {title}
        </h2>
        <button
          type="button"
          className={cn(navButton, SURFACE, LINE)}
          onClick={() => onMonthChange(monthKey(year, month + 1))}
          aria-label="Next month"
          data-testid="events-month-next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </header>
      <div className="grid grid-cols-7 gap-1.5" aria-label="Month">
        {headers.map((dow) => (
          <div key={dow} className={cn("px-2 pb-1 text-sm font-bold", SATCHEL_TONES[DOW_TONES[dow]].fg)}>
            {WEEKDAY[dow]}
          </div>
        ))}
        {cells.map((c) => {
          const dayItems = byDate.get(c.iso) ?? [];
          const extra = dayItems.length - MAX_CHIPS;
          const isToday = c.iso === todayIso;
          return (
            <div
              key={c.iso}
              className={cn(
                "flex min-h-[104px] min-w-0 flex-col gap-1 rounded-[14px] border-2 p-1.5",
                isToday ? "border-[#f4b942] bg-[#fcecc4] dark:bg-[#f4b942]/15" : "border-transparent",
                !c.inMonth && "opacity-40",
              )}
              aria-current={isToday ? "date" : undefined}
              data-testid={`events-month-cell-${c.iso}`}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                  isToday && "bg-[#a83818] text-[#fff8ef] dark:bg-[#e07a52]",
                )}
              >
                {Number(c.iso.slice(8))}
              </span>
              {dayItems.slice(0, MAX_CHIPS).map((item) => (
                <EventChip key={item.eventId} item={item} />
              ))}
              {extra > 0 && (
                <span className="px-1 text-xs font-semibold text-[#5d5648] dark:text-muted-foreground">+{extra} more</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
