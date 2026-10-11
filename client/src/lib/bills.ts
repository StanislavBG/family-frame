import { pointTimeMs } from "@shared/time-series";
import type { TimePoint, TimeSeries } from "@shared/time-series";
import { addDaysIso } from "./person-day";
import { seriesStats } from "./time-series";
import type { SeriesStats } from "./time-series";

export type BillTone = "check" | "action" | "soon" | "ok" | "paid";

export interface Bill {
  id: string;
  what: string;
  name: string;
  group: string;
  color: string;
  unit: string | null;
  latest: number | null;
  latestT: string | null;
  dueDate: string | null;
  autopay: boolean | null;
  tone: BillTone;
  setAside: boolean;
  note: string;
  points: TimePoint[];
  stats: SeriesStats;
}

const PALETTE = ["#f4b942", "#a83818", "#2e5a3e", "#5d5648", "#1a1612", "#3a342b", "#9c937f", "#3d6a8f"];
const GROUP_ORDER = ["Utilities", "Internet", "Home"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${isoDay(iso)}T00:00:00Z`) / 86_400_000);
}

/** "Oct 5" from a YYYY-MM-DD string, no timezone shift. */
function shortDate(iso: string): string {
  const day = isoDay(iso);
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

function latestPoint(points: TimePoint[]): TimePoint | null {
  let best: TimePoint | null = null;
  for (const p of points) {
    if (best === null || pointTimeMs(p.t) >= pointTimeMs(best.t)) best = p;
  }
  return best;
}

export function toBill(series: TimeSeries, points: TimePoint[], today: string, index = 0): Bill {
  const sa = series.annotations ?? {};
  const last = latestPoint(points);
  const la = last?.annotations ?? {};
  const rawDue = str(la.dueDate);
  const dueDate = rawDue && YMD.test(rawDue) ? rawDue : null;
  const paymentStatus = str(la.paymentStatus);
  const paid = la.paid === true;
  const autopay: boolean | null =
    typeof la.autopay === "boolean"
      ? la.autopay
      : paymentStatus === "autopay" || paymentStatus === "autopay-scheduled"
        ? true
        : null;

  let tone: BillTone;
  if (
    last === null ||
    dueDate === null ||
    paymentStatus === "paid" ||
    (paid && autopay !== true) ||
    (autopay === true && dueDate < today)
  ) {
    tone = "paid";
  } else if (paymentStatus === "past-due" || dueDate < today) {
    tone = "check";
  } else if (autopay === false) {
    tone = "action";
  } else if (autopay === null) {
    tone = "check";
  } else if (dueDate <= addDaysIso(today, 7)) {
    tone = "soon";
  } else {
    tone = "ok";
  }

  return {
    id: series.id,
    what: str(sa.category) ?? series.title,
    name: str(sa.vendorShort) ?? str(sa.vendor) ?? "",
    group: str(sa.group) ?? "Bills",
    color: series.color || PALETTE[index % PALETTE.length],
    unit: series.unit ?? null,
    latest: last ? last.value : null,
    latestT: last ? last.t : null,
    dueDate,
    autopay,
    tone,
    setAside: sa.setAside === true,
    note: series.description ?? "",
    points,
    stats: seriesStats(points),
  };
}

export function dueInText(dueDate: string, today: string): string {
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Was due yesterday";
  if (days < -1) return `Was due ${-days} days ago`;
  if (days >= 28) return `In ${Math.round(days / 7)} weeks`;
  return `In ${days} days`;
}

export function payLabel(bill: Bill): string {
  if (bill.tone === "action" || bill.autopay === false) return "You pay this one";
  if (bill.autopay === true) return "Pays automatically";
  return "Autopay? Not sure";
}

export function groupBills(bills: Bill[]): Array<{ title: string; items: Bill[] }> {
  const map = new Map<string, Bill[]>();
  for (const b of bills) {
    const list = map.get(b.group);
    if (list) list.push(b);
    else map.set(b.group, [b]);
  }
  const rank = (t: string) => {
    const i = GROUP_ORDER.indexOf(t);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return Array.from(map.keys())
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === GROUP_ORDER.length ? a.localeCompare(b) : 0))
    .map((title) => ({ title, items: map.get(title)! }));
}

function byDue(a: Bill, b: Bill): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

export function dueBills(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.tone !== "paid").sort((a, b) => byDue(a, b) || a.what.localeCompare(b.what));
}

export function paidBills(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.tone === "paid");
}

export function todoBills(bills: Bill[]): Bill[] {
  return [
    ...bills.filter((b) => b.tone === "action").sort(byDue),
    ...bills.filter((b) => b.tone === "check").sort(byDue),
  ];
}

export function nextUpBills(bills: Bill[], n = 3): Bill[] {
  return bills
    .filter((b) => b.tone === "soon" || b.tone === "ok")
    .sort(byDue)
    .slice(0, n);
}

export function attentionCount(bills: Bill[]): number {
  return bills.filter((b) => b.tone === "action" || b.tone === "check").length;
}

export function paidLabel(bill: Bill, today: string): string {
  if (bill.latestT === null) return "No bills yet";
  if (bill.dueDate !== null && bill.dueDate <= today) return `Paid ${shortDate(bill.dueDate)}`;
  return `Billed ${shortDate(bill.latestT)}`;
}

export function checkSummary(series: TimeSeries[], now: Date): string | null {
  let oldest: number | null = null;
  let needLook = 0;
  for (const s of series) {
    const health = s.annotations?.health;
    if (!health || typeof health !== "object") continue;
    const h = health as Record<string, unknown>;
    if (h.severity === "warn" || h.severity === "alert") needLook += 1;
    const at = typeof h.checkedAt === "string" ? Date.parse(h.checkedAt) : NaN;
    if (!Number.isNaN(at) && (oldest === null || at < oldest)) oldest = at;
  }
  if (oldest === null) return null;
  const noun = (n: number) => (n === 1 ? "1 bill" : `${n} bills`);
  if (needLook > 0) return `${noun(needLook)} ${needLook === 1 ? "needs" : "need"} a look`;

  const checked = new Date(oldest);
  const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const diff = dayOf(now) - dayOf(checked);
  let when: string;
  if (diff <= 0) when = checked.getHours() < 12 ? "this morning" : "today";
  else if (diff === 1) when = "yesterday";
  else when = `on ${MONTHS[checked.getMonth()]} ${checked.getDate()}`;
  return `All ${noun(series.length)} checked ${when}`;
}

export function money(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function shortMoney(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;
}
