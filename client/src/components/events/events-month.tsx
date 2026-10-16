import { useMemo } from "react";
import { Link } from "wouter";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { DOW_TONES, LINE, SATCHEL_TONES, SERIF, SURFACE } from "@/components/person/satchel";
import { useToday } from "@/hooks/use-today";
import { CATEGORY_META, eventDayEntries, monthCellItems, type EventItem } from "@/lib/events";
import { buildMonthCells, WEEKDAY_SHORT as WEEKDAY } from "@/lib/person-day";
import { cn } from "@/lib/utils";

interface EventsMonthProps {
  items: EventItem[];
  /** Any YYYY-MM-DD (or YYYY-MM) inside the month to show. */
  monthIso: string;
  /** Called with the first day (YYYY-MM-01) of the newly selected month. */
  onMonthChange: (monthIso: string) => void;
  weekStartsMonday: boolean;
  /** Selected day (YYYY-MM-DD); gets a ring in the grid. */
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}

function parseMonth(monthIso: string): { year: number; month: number } {
  const [y, m] = monthIso.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function monthKey(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function EventChip({ item, allDay }: { item: EventItem; allDay?: boolean }) {
  const tone = SATCHEL_TONES[CATEGORY_META[item.event.category].tone];
  const cancelled = item.event.status === "cancelled";
  const { title } = item.event;
  return (
    <Link
      href={`/${encodeURIComponent(item.eventId)}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold",
        tone.bg,
        tone.fg,
        cancelled && "line-through",
        allDay && "border border-dashed border-current",
      )}
      aria-label={`${title}${item.response === "going" ? ", going" : item.response === "interested" ? ", interested" : ""}${cancelled ? ", cancelled" : ""}${item.hasUnseenUpdate ? ", changed" : ""}${allDay ? ", open all day" : ""}`}
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

function dayLabel(iso: string, count: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const text = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${text}, ${count} ${count === 1 ? "event" : "events"}`;
}

export function EventsMonth({
  items,
  monthIso,
  onMonthChange,
  weekStartsMonday,
  selectedDate,
  onSelectDate,
}: EventsMonthProps) {
  const todayIso = useToday();
  const { year, month } = parseMonth(monthIso);
  const cells = buildMonthCells(year, month, weekStartsMonday);

  const days = useMemo(() => {
    const map = new Map<string, ReturnType<typeof eventDayEntries<EventItem>>>();
    for (const c of cells) map.set(c.iso, eventDayEntries(items, c.iso));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, monthIso, weekStartsMonday]);

  const select = (iso: string) => {
    onSelectDate(iso);
    if (iso.slice(0, 7) !== monthIso.slice(0, 7)) onMonthChange(`${iso.slice(0, 7)}-01`);
  };

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
          const entries = days.get(c.iso);
          const list = monthCellItems(entries ?? { sessions: [], open: [] });
          const isToday = c.iso === todayIso;
          const isSelected = c.iso === selectedDate;
          return (
            <div
              key={c.iso}
              className={cn(
                "flex h-[150px] min-w-0 cursor-pointer flex-col gap-1 rounded-[14px] border-2 p-1.5",
                isToday ? "border-[#f4b942] bg-[#fcecc4] dark:bg-[#f4b942]/15" : "border-transparent",
                isSelected && "ring-2 ring-[#a83818] ring-offset-1 dark:ring-[#e07a52]",
                !c.inMonth && "opacity-40",
              )}
              onClick={() => select(c.iso)}
              aria-current={isToday ? "date" : undefined}
              data-testid={`events-month-cell-${c.iso}`}
            >
              <button
                type="button"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  isToday && "bg-[#a83818] text-[#fff8ef] dark:bg-[#e07a52] dark:text-[#1a1612]",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  select(c.iso);
                }}
                aria-label={dayLabel(c.iso, (entries?.sessions.length ?? 0) + (entries?.open.length ?? 0))}
                aria-pressed={isSelected}
                data-testid={`events-month-day-${c.iso}`}
              >
                {Number(c.iso.slice(8))}
              </button>
              <div
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
                data-testid={`events-month-cell-list-${c.iso}`}
              >
                {list.map(({ item, allDay }) => (
                  <EventChip key={item.eventId} item={item} allDay={allDay} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
