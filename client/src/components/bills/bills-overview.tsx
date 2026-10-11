// Overview screen of the Utilities 2.0 "Household bills" design: summary + month chart, To do, Next up.
import { useMemo, useState } from "react";
import { LINE, MONO, SERIF } from "@/components/person/satchel";
import { BILL_NAV_BG, BILL_PANEL, BILL_RULE, Kicker } from "@/components/bills/bills-ui";
import { StackChart } from "@/components/bills/bills-charts";
import { dueInText, money, nextUpBills, todoBills, type Bill } from "@/lib/bills";
import { averageMonth, breakdown, monthLabel, monthWindow, setAsideNote, stackMonths, type StackInput } from "@/lib/bills-chart";

const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const dayNum = (ymd: string): number => {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

function shortDate(ymd: string): { mon: string; day: number } {
  const [, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return { mon: MONTHS[m - 1] ?? "", day: d };
}

function actionKicker(dueDate: string | null, today: string): string {
  if (!dueDate) return "PAY";
  const { mon, day } = shortDate(dueDate);
  const days = dayNum(dueDate) - dayNum(today);
  const left = days === 0 ? "TODAY" : days === 1 ? "1 DAY" : days < 0 ? `${-days} DAYS LATE` : `${days} DAYS`;
  return `PAY BY ${mon} ${day} · ${left}`;
}

const lower = (s: string) => s.toLowerCase();

export function BillsOverview({
  bills,
  today,
  onOpen,
  onOpenDue,
}: {
  bills: Bill[];
  today: string;
  onOpen: (id: string) => void;
  onOpenDue: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const { months, columns, average, rows, note } = useMemo(() => {
    const inputs: StackInput[] = bills.map((b) => ({
      id: b.id,
      what: b.what,
      color: b.color,
      points: b.points,
      setAside: b.setAside,
    }));
    const months = monthWindow(today, 13);
    return {
      months,
      columns: stackMonths(inputs, months),
      average: averageMonth(inputs, today),
      rows: breakdown(inputs, months, selected, today),
      note: setAsideNote(inputs, today),
    };
  }, [bills, today, selected]);

  const monthKey = selected === null ? null : months[selected];
  const label = monthKey ? `${monthLabel(monthKey).mon} ${monthLabel(monthKey).year}` : "Average month";
  const total = monthKey ? (columns[selected as number]?.total ?? 0) : average;
  const base = monthKey ? "Billed this month" : "Regular bills";
  const sub = note ? `${base}, without ${note.label}` : base;
  const todo = todoBills(bills);
  const next = nextUpBills(bills, 3);

  return (
    <div className="flex flex-col gap-4">
      <section className={`grid grid-cols-[250px_minmax(0,1fr)] gap-6 rounded-[10px] border p-5 ${BILL_PANEL} ${BILL_RULE}`}>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold uppercase tracking-[.06em] text-[#5d5648] dark:text-muted-foreground">{label}</span>
            <span className={`${SERIF} text-[52px] font-bold leading-none`}>{wholeDollars.format(Math.round(total))}</span>
            <span className="text-sm text-[#3a342b] dark:text-[#c9bfa9]">{sub}</span>
          </div>
          <div className={`flex flex-col gap-1 border-t pt-3 ${BILL_RULE}`}>
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r.id)}
                className="flex min-h-[44px] w-full flex-col justify-center gap-[3px] bg-transparent text-left text-[#1a1612] dark:text-[#f5f0e6]"
              >
                <span className="flex w-full justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
                    {r.what}
                  </span>
                  <span className={`${MONO} text-[13px]`}>{r.value > 0 ? money(r.value) : "no bill"}</span>
                </span>
                <span className={`block h-1 w-full overflow-hidden rounded-sm ${BILL_NAV_BG}`}>
                  <span className="block h-full" style={{ width: `${r.pct}%`, background: r.color }} />
                </span>
              </button>
            ))}
          </div>
          {note && (
            <div className={`mt-auto rounded-md px-3 py-2.5 text-[13px] text-[#3a342b] dark:text-[#c9bfa9] ${BILL_NAV_BG}`}>
              Plus {note.label}: <b>{wholeDollars.format(Math.round(note.monthly))}/mo</b> set aside →{" "}
              <b>{wholeDollars.format(Math.round(note.total))}</b> a month total
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`${SERIF} text-xl font-semibold`}>Month by month</span>
            {selected !== null ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="min-h-[44px] rounded border border-[#2a241c] bg-transparent px-3 text-[13px] font-semibold text-[#1a1612] dark:border-[#f5f0e6]/40 dark:text-[#f5f0e6]"
              >
                Show average
              </button>
            ) : (
              <span className="text-[13px] text-[#5d5648] dark:text-muted-foreground">
                Tap a month for its breakdown · <span className="text-[#a83818] dark:text-[#e07a52]">- - average</span>
              </span>
            )}
          </div>
          <StackChart columns={columns} months={months} average={average} selected={selected} onSelect={setSelected} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="flex flex-col gap-2.5">
          <Kicker>To do</Kicker>
          {todo.length === 0 && (
            <p className={`rounded-lg border px-4 py-3.5 text-sm text-[#3a342b] dark:text-[#c9bfa9] ${LINE}`}>
              Nothing to do — every bill is paid or pays itself
            </p>
          )}
          {todo.map((b) => {
            const action = b.tone === "action";
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onOpen(b.id)}
                className={
                  action
                    ? "flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-[#1a1612] px-[18px] py-3.5 text-left text-[#f5f0e6] dark:bg-[#f5f0e6] dark:text-[#1a1612]"
                    : `flex min-h-[44px] items-center justify-between gap-3 rounded-lg border px-[18px] py-3.5 text-left text-[#1a1612] dark:text-[#f5f0e6] ${BILL_NAV_BG} ${BILL_RULE}`
                }
              >
                <span className="flex flex-col gap-0.5">
                  <span
                    className={`${MONO} text-xs tracking-[.06em] ${action ? "text-[#f4b942] dark:text-[#a83818]" : "text-[#a83818] dark:text-[#e07a52]"}`}
                  >
                    {action ? actionKicker(b.dueDate, today) : b.dueDate ? dueInText(b.dueDate, today).toUpperCase() : "CHECK"}
                  </span>
                  <span className={`${SERIF} text-xl font-semibold`}>
                    {action ? `Pay the ${lower(b.what)}` : `Check the ${lower(b.what)} bill`}
                  </span>
                  {!action && (
                    <span className="text-[13px] text-[#3a342b] dark:text-[#c9bfa9]">
                      {b.autopay === null ? "Autopay unclear" : "Past due"} · usually {b.stats.median === null ? "—" : money(b.stats.median)}
                    </span>
                  )}
                </span>
                <span className={`${SERIF} text-2xl font-bold`}>{b.latest === null ? "" : money(b.latest)}</span>
              </button>
            );
          })}
        </section>
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <Kicker>Next up · pays itself</Kicker>
            <button
              type="button"
              onClick={onOpenDue}
              className="min-h-[44px] bg-transparent text-[13px] font-semibold text-[#a83818] dark:text-[#e07a52]"
            >
              All due dates →
            </button>
          </div>
          <div className="flex flex-col border-t border-[#2a241c] dark:border-white/20">
            {next.map((b) => {
              const d = b.dueDate ? shortDate(b.dueDate) : null;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpen(b.id)}
                  className={`grid min-h-[56px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b bg-transparent px-1 text-left text-[#1a1612] dark:text-[#f5f0e6] ${BILL_RULE}`}
                >
                  <span className={`${MONO} text-[13px] font-semibold`}>
                    {d ? `${d.mon[0]}${d.mon.slice(1).toLowerCase()} ${d.day}` : ""}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">{b.what}</span>
                    <span className="text-xs text-[#5d5648] dark:text-muted-foreground">
                      {b.dueDate ? dueInText(b.dueDate, today) : ""}
                    </span>
                  </span>
                  <span className={`${SERIF} text-xl font-bold`}>{b.latest === null ? "" : money(b.latest)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
