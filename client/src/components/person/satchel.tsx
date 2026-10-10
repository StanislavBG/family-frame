// Visual language of the Satchel design (claude.ai/design "Satchel App"): warm parchment
// surfaces, soft tinted tiles, serif headings. Shared by the People person views.
import { cn } from "@/lib/utils";

export const SERIF = "font-['Source_Serif_4',Georgia,serif]";
export const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

/** Foreground + tint pairs; class strings are literal so Tailwind generates them. */
export const SATCHEL_TONES = {
  clay: { fg: "text-[#a83818] dark:text-[#e07a52]", bg: "bg-[#f7ddd0] dark:bg-[#e07a52]/15", solid: "bg-[#a83818] dark:bg-[#e07a52]" },
  sun: { fg: "text-[#7a5200] dark:text-[#f4b942]", bg: "bg-[#fcecc4] dark:bg-[#f4b942]/15", solid: "bg-[#7a5200] dark:bg-[#f4b942]" },
  leaf: { fg: "text-[#2e5a3e] dark:text-[#8fc49d]", bg: "bg-[#dce8d6] dark:bg-[#8fc49d]/15", solid: "bg-[#2e5a3e] dark:bg-[#8fc49d]" },
  sky: { fg: "text-[#3d6a8f] dark:text-[#8fb4d4]", bg: "bg-[#dde8f1] dark:bg-[#8fb4d4]/15", solid: "bg-[#3d6a8f] dark:bg-[#8fb4d4]" },
  plum: { fg: "text-[#7a4a73] dark:text-[#d49ac9]", bg: "bg-[#eedfec] dark:bg-[#d49ac9]/15", solid: "bg-[#7a4a73] dark:bg-[#d49ac9]" },
  stone: { fg: "text-[#5d5648] dark:text-[#c9bfa9]", bg: "bg-[#ece6da] dark:bg-[#c9bfa9]/15", solid: "bg-[#5d5648] dark:bg-[#c9bfa9]" },
} as const;

export type SatchelTone = keyof typeof SATCHEL_TONES;

/** Cycle used for metric tiles and lesson chips, as in the design (In, Out, Nap, Diapers, Theme). */
export const TILE_CYCLE: SatchelTone[] = ["sun", "clay", "sky", "plum", "leaf"];
export const CHIP_CYCLE: SatchelTone[] = ["leaf", "sun", "sky", "plum", "clay"];

/** Weekday colours (Mon clay, Tue sun, Wed leaf, Thu sky, Fri plum, weekend stone). */
export const DOW_TONES: SatchelTone[] = ["stone", "clay", "sun", "leaf", "sky", "plum", "stone"];

export const SURFACE = "bg-[#fffaf0] dark:bg-card";
export const PAGE = "bg-[#f5f0e6] dark:bg-background";
export const LINE = "border-[#e3dcc8] dark:border-border";
export const MUTED = "text-[#5d5648] dark:text-muted-foreground";

export function SectionLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("text-xs font-bold uppercase tracking-[.06em]", MUTED, className)}>{children}</div>
  );
}

export function ToneChip({ tone, className, children }: { tone: SatchelTone; className?: string; children: React.ReactNode }) {
  const t = SATCHEL_TONES[tone];
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold", t.bg, t.fg, className)}>
      {children}
    </span>
  );
}

export function MetricTile({ tone, label, value, size = "text-2xl" }: { tone: SatchelTone; label: string; value: string; size?: string }) {
  const t = SATCHEL_TONES[tone];
  return (
    <div className={cn("min-w-0 rounded-xl px-3 py-2", t.bg)} data-testid="day-sheet-metric">
      <div className={cn("truncate text-xs font-semibold", t.fg)}>{label}</div>
      <div className={cn(SERIF, "truncate font-bold", size, t.fg)} title={value}>{value}</div>
    </div>
  );
}

/** Square date badge: weekday (or month) above a big serif number. */
export function DateBadge({ tone, top, num, size = 46 }: { tone: SatchelTone; top: string; num: number | string; size?: number }) {
  const t = SATCHEL_TONES[tone];
  return (
    <div
      className={cn("flex flex-none flex-col items-center justify-center rounded-[14px] leading-none", t.bg, t.fg)}
      style={{ width: size, height: size }}
    >
      <span className="text-[10px] font-bold uppercase">{top}</span>
      <span className={cn(SERIF, "text-xl font-bold")}>{num}</span>
    </div>
  );
}

/** The Satchel owl mark, tinted clay. */
export function OwlAvatar() {
  const eye = (side: "left" | "right") => (
    <span
      className="absolute top-[9px] flex h-[17px] w-[17px] items-center justify-center rounded-full bg-[#fffaf0]"
      style={{ [side]: 5 }}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-[#1a1612]" />
    </span>
  );
  const ear = (side: "left" | "right") => (
    <span
      className="absolute -top-[5px] h-0 w-0 border-x-[7px] border-b-[10px] border-x-transparent border-b-[#a83818]"
      style={{ [side]: 5 }}
    />
  );
  return (
    <div
      className="relative h-[46px] w-[46px] flex-none -rotate-[4deg] rounded-[16px_16px_14px_14px] bg-[#a83818]"
      aria-hidden
    >
      {ear("left")}
      {ear("right")}
      {eye("left")}
      {eye("right")}
      <span className="absolute left-1/2 top-[26px] -ml-[5px] h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-[#f4b942]" />
      <span className="absolute bottom-1 left-2.5 right-2.5 h-[5px] rounded-[3px] bg-[#f7ddd0] opacity-50" />
    </div>
  );
}
