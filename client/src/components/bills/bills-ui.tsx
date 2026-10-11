// Shared visual pieces of the Utilities 2.0 "Household bills" design
// (docs/design/household-bills-v2.dc.html). Class strings are literal so Tailwind generates them.
import { cn } from "@/lib/utils";

export const BILL_TONES = {
  check: {
    badge: "bg-[#a83818] text-[#f5f0e6] dark:bg-[#e07a52] dark:text-[#1a1612]",
    ink: "text-[#a83818] dark:text-[#e07a52]",
  },
  action: {
    badge: "bg-[#1a1612] text-[#f5f0e6] dark:bg-[#f5f0e6] dark:text-[#1a1612]",
    ink: "text-[#1a1612] dark:text-[#f5f0e6]",
  },
  soon: {
    badge: "bg-[#f4b942] text-[#1a1612] dark:bg-[#f4b942] dark:text-[#1a1612]",
    ink: "text-[#1a1612] dark:text-[#f5f0e6]",
  },
  ok: {
    badge: "bg-[#e3dcc8] text-[#1a1612] dark:bg-white/10 dark:text-[#f5f0e6]",
    ink: "text-[#3a342b] dark:text-[#c9bfa9]",
  },
  paid: {
    badge: "bg-transparent text-[#2e5a3e] dark:text-[#8fc49d]",
    ink: "text-[#2e5a3e] dark:text-[#8fc49d]",
  },
} as const satisfies Record<string, { badge: string; ink: string }>;

export const BILL_PANEL = "bg-[#fffaf0] dark:bg-card";
export const BILL_NAV_BG = "bg-[#ede6d6] dark:bg-muted";
export const BILL_RULE = "border-[#d4ccb8] dark:border-border";

export function Kicker({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("text-[13px] font-semibold uppercase tracking-[.08em] text-[#a83818] dark:text-[#e07a52]", className)}>
      {children}
    </div>
  );
}
