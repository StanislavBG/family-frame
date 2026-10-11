import { money, paidLabel, payLabel, shortMoney } from "@/lib/bills";
import type { Bill } from "@/lib/bills";
import { monthValues, monthWindow, yearlyTotal } from "@/lib/bills-chart";
import { cn } from "@/lib/utils";
import { LINE, MUTED, SERIF, SURFACE } from "@/components/person/satchel";
import { BILL_RULE } from "./bills-ui";
import { BillLineChart } from "./bills-charts";

function statValue(v: number | null): string {
  if (v === null) return "—";
  return v >= 10000 ? shortMoney(v) : money(v);
}

function dueText(bill: Bill, today: string): string {
  if (bill.tone === "paid" || bill.dueDate === null) return paidLabel(bill, today);
  const [y, m, d] = bill.dueDate.slice(0, 10).split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Due ${day}`;
}

export function BillService({ bill, today }: { bill: Bill; today: string }) {
  const manual = bill.tone === "action" || bill.tone === "check";
  const months = monthWindow(today, 13);
  const stats: Array<[string, number | null]> = [
    ["Latest", bill.stats.latest],
    ["Average", bill.stats.avg],
    ["Middle bill", bill.stats.median],
    ["Lowest", bill.stats.min],
    ["Highest", bill.stats.max],
    ["Per year", yearlyTotal(bill.points, today)],
  ];

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[15px] text-[#3a342b] dark:text-foreground">
          {bill.name !== "" ? `${bill.name} · ` : ""}
          {bill.stats.count} bills on file · {dueText(bill, today)}
        </span>
        <span
          className={cn(
            "rounded-xl px-3 py-1 text-[13px] font-semibold text-[#f5f0e6] dark:text-[#1a1612]",
            manual ? "bg-[#a83818] dark:bg-[#e07a52]" : "bg-[#2e5a3e] dark:bg-[#8fc49d]",
          )}
        >
          {payLabel(bill)}
        </span>
      </div>
      <div className={cn("grid grid-cols-6 gap-3 border-t-2 border-b border-t-[#2a241c] py-3.5 dark:border-t-foreground/60", BILL_RULE)}>
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className={cn("text-[26px] font-bold", SERIF)}>{statValue(value)}</span>
            <span className={cn("text-[13px]", MUTED)}>{label}</span>
          </div>
        ))}
      </div>
      <div className={cn("rounded-[10px] border px-[18px] py-4", SURFACE, LINE)}>
        <BillLineChart values={monthValues(bill.points, months)} months={months} average={bill.stats.avg ?? 0} />
      </div>
      {bill.note !== "" && (
        <div className="rounded-md bg-[#ede6d6] px-4 py-3 text-[15px] text-[#3a342b] dark:bg-muted dark:text-foreground">
          {bill.note}
        </div>
      )}
    </div>
  );
}
