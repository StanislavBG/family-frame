import { dueBills, dueInText, money, paidBills, paidLabel, payLabel } from "@/lib/bills";
import type { Bill } from "@/lib/bills";
import { cn } from "@/lib/utils";
import { MONO, MUTED, SERIF } from "@/components/person/satchel";
import { BILL_RULE, BILL_TONES } from "./bills-ui";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function badgeParts(dueDate: string | null): { mon: string; day: string } {
  if (dueDate === null) return { mon: "—", day: "–" };
  return { mon: MONTHS[Number(dueDate.slice(5, 7)) - 1] ?? "—", day: String(Number(dueDate.slice(8, 10))) };
}

export function BillsDue({
  bills,
  today,
  onOpen,
}: {
  bills: Bill[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const due = dueBills(bills);
  const paid = paidBills(bills);

  return (
    <div className="flex min-h-0 flex-col gap-[18px] overflow-auto">
      {due.length === 0 ? (
        <p className={cn("border-t-2 border-[#2a241c] pt-4 text-base dark:border-foreground/60", MUTED)}>
          Nothing is due — all bills are paid
        </p>
      ) : (
        <div className="flex flex-col border-t-2 border-[#2a241c] dark:border-foreground/60">
          {due.map((bill) => {
            const tone = BILL_TONES[bill.tone];
            const { mon, day } = badgeParts(bill.dueDate);
            return (
              <button
                key={bill.id}
                type="button"
                onClick={() => onOpen(bill.id)}
                className={cn(
                  "grid min-h-[76px] grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-[18px] border-b bg-transparent px-1 py-2 text-left text-[#1a1612] dark:text-foreground",
                  BILL_RULE,
                )}
              >
                <span className={cn("flex flex-col items-center rounded-md py-1.5", tone.badge)}>
                  <span className={cn("text-[11px] tracking-[.06em]", MONO)}>{mon}</span>
                  <span className={cn("text-[26px] font-bold leading-[1.1]", SERIF)}>{day}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2.5">
                    <span className={cn("text-[22px] font-semibold", SERIF)}>{bill.what}</span>
                    <span className={cn("text-sm", MUTED)}>{bill.name}</span>
                  </span>
                  <span className="text-sm text-[#3a342b] dark:text-muted-foreground">
                    <b className={tone.ink}>{bill.dueDate ? dueInText(bill.dueDate, today) : "No due date"}</b>
                    {" · "}
                    {payLabel(bill)}
                  </span>
                </span>
                <span className={cn("text-[26px] font-bold", SERIF)}>
                  {bill.latest === null ? "—" : money(bill.latest)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {paid.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={cn("text-sm", MUTED)}>Already paid · next bill not out yet</span>
          <div className="grid grid-cols-2 gap-3">
            {paid.map((bill) => (
              <button
                key={bill.id}
                type="button"
                onClick={() => onOpen(bill.id)}
                className={cn(
                  "flex min-h-[44px] justify-between gap-3 rounded-lg border border-dashed bg-transparent px-4 py-3.5 text-left text-[#1a1612] dark:text-foreground",
                  BILL_RULE,
                )}
              >
                <span className="flex flex-col">
                  <span className="text-base font-semibold">{bill.what}</span>
                  <span className="text-[13px] text-[#2e5a3e] dark:text-[#8fc49d]">{paidLabel(bill, today)}</span>
                </span>
                <span className={cn("text-xl font-bold", SERIF)}>
                  {bill.latest === null ? "—" : money(bill.latest)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
