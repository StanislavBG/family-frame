import type { TimePoint } from "@shared/time-series";
import { addDaysIso } from "./person-day";

export interface StackInput {
  id: string;
  what: string;
  color: string;
  points: TimePoint[];
  setAside: boolean;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NICE_STEPS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const MAX_GRIDLINES = 6;

const monthOf = (t: string): string => t.slice(0, 7);

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** YYYY-MM entries, oldest first, ending at today's month. */
export function monthWindow(today: string, n = 13): string[] {
  const end = monthOf(today);
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - (n - 1)));
}

export function monthLabel(month: string): { mon: string; year: string } {
  const [year, m] = month.split("-");
  return { mon: MONTH_NAMES[Number(m) - 1] ?? "", year };
}

function monthSum(points: TimePoint[], month: string): number {
  let sum = 0;
  for (const p of points) if (monthOf(p.t) === month) sum += p.value;
  return sum;
}

export function stackMonths(
  inputs: StackInput[],
  months: string[],
): Array<{ month: string; total: number; segments: Array<{ id: string; color: string; value: number }> }> {
  const regular = inputs.filter((i) => !i.setAside);
  return months.map((month) => {
    const segments: Array<{ id: string; color: string; value: number }> = [];
    let total = 0;
    for (const input of regular) {
      const value = monthSum(input.points, month);
      if (value === 0) continue;
      segments.push({ id: input.id, color: input.color, value });
      total += value;
    }
    return { month, total, segments };
  });
}

/** Sum of points dated in (today - 365 days, today]. */
export function yearlyTotal(points: TimePoint[], today: string): number {
  const to = today.slice(0, 10);
  const from = addDaysIso(to, -365);
  let sum = 0;
  for (const p of points) {
    const d = p.t.slice(0, 10);
    if (d > from && d <= to) sum += p.value;
  }
  return sum;
}

export function averageMonth(inputs: StackInput[], today: string): number {
  let sum = 0;
  for (const i of inputs) if (!i.setAside) sum += yearlyTotal(i.points, today);
  return sum / 12;
}

export function breakdown(
  inputs: StackInput[],
  months: string[],
  selected: number | null,
  today: string,
): Array<{ id: string; what: string; color: string; value: number; pct: number }> {
  const month = selected === null ? null : months[selected];
  const rows = inputs
    .filter((i) => !i.setAside)
    .map((i) => ({
      id: i.id,
      what: i.what,
      color: i.color,
      value: month === null || month === undefined ? yearlyTotal(i.points, today) / 12 : monthSum(i.points, month),
    }))
    .sort((a, b) => b.value - a.value);
  const top = rows.length > 0 ? rows[0].value : 0;
  return rows.map((r) => ({ ...r, pct: top > 0 ? (r.value / top) * 100 : 0 }));
}

export function setAsideNote(
  inputs: StackInput[],
  today: string,
): { label: string; monthly: number; total: number } | null {
  const aside = inputs.filter((i) => i.setAside);
  if (aside.length === 0) return null;
  const monthly = aside.reduce((s, i) => s + yearlyTotal(i.points, today), 0) / 12;
  return {
    label: aside.map((i) => i.what.toLowerCase()).join(" and "),
    monthly,
    total: averageMonth(inputs, today) + monthly,
  };
}

export function niceAxis(maxValue: number): { max: number; step: number } {
  const v = Math.max(0, maxValue);
  const step = NICE_STEPS.find((s) => Math.ceil(v / s) <= MAX_GRIDLINES) ?? NICE_STEPS[NICE_STEPS.length - 1];
  return { max: Math.max(1, Math.ceil(v / step)) * step, step };
}

/** Per-month sum for one bill; null when it has no point that month. */
export function monthValues(points: TimePoint[], months: string[]): Array<number | null> {
  return months.map((month) => {
    let sum = 0;
    let seen = false;
    for (const p of points) {
      if (monthOf(p.t) === month) {
        sum += p.value;
        seen = true;
      }
    }
    return seen ? sum : null;
  });
}
