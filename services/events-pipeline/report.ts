import { getPublishedRecommendation, listHouseholds, listRecommendationsForHousehold, type EventsDb } from "./db";

export interface ReportOptions {
  now: Date;
  runs?: number;
  householdId?: string;
  timeZone?: string;
}

type Obj = Record<string, unknown>;

interface RunCells {
  haikuSessions: number | null;
  costUsd: number | null;
  searches: number | null;
  candidates: number | null;
  normalizeRejected: number | null;
  ranked: number | null;
  published: number | null;
}

const DEFAULT_RUNS = 10;
const DEFAULT_TZ = "America/Los_Angeles";
const MAX_RECS = 30;
const TOP_REASONS = 8;
const EMPTY: RunCells = {
  haikuSessions: null,
  costUsd: null,
  searches: null,
  candidates: null,
  normalizeRejected: null,
  ranked: null,
  published: null,
};

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseJson(text: unknown): Obj | null {
  if (typeof text !== "string" || text === "") return null;
  try {
    const v: unknown = JSON.parse(text);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

function makeFmt(timeZone: string): (iso: string | null | undefined) => string {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
  } catch {
    return makeFmt(DEFAULT_TZ);
  }
  return (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : f.format(d);
  };
}

const sumNullable = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

function fromStats(s: Obj): RunCells {
  const haiku = isObj(s.haiku) ? s.haiku : null;
  return {
    haikuSessions: haiku ? num(haiku.sessions) : null,
    costUsd: haiku ? num(haiku.costUsd) : null,
    searches: num(s.searches),
    candidates: num(s.candidates),
    normalizeRejected: num(s.normalizeRejected),
    ranked: num(s.ranked),
    published: num(s.published),
  };
}

/** Parse a runs.stats_json cell into table cells; never throws. */
function parseStats(text: unknown): RunCells {
  const s = parseJson(text);
  if (!s) return EMPTY;
  const cells = fromStats(s);
  if (Array.isArray(s.runs)) {
    // watch row: sum the per-household discover stats
    for (const r of s.runs) {
      const inner = isObj(r) && isObj(r.stats) ? fromStats(r.stats) : null;
      if (!inner) continue;
      cells.searches = sumNullable(cells.searches, inner.searches);
      cells.candidates = sumNullable(cells.candidates, inner.candidates);
      cells.normalizeRejected = sumNullable(cells.normalizeRejected, inner.normalizeRejected);
      cells.ranked = sumNullable(cells.ranked, inner.ranked);
      cells.published = sumNullable(cells.published, inner.published);
    }
  }
  return cells;
}

const cell = (v: number | null, digits = 0): string => (v === null ? "-" : digits ? v.toFixed(digits) : String(v));
const esc = (s: unknown): string => String(s ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

function topCounts(v: unknown): string {
  if (!isObj(v)) return "none";
  const entries = Object.entries(v)
    .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_REASONS);
  return entries.length ? entries.map(([k, n]) => `${esc(k)}: ${n}`).join(", ") : "none";
}

/** Markdown profile of recent pipeline runs and recommendations. Contains no address, coordinates, profile or tokens. */
export function buildReport(db: EventsDb, opts: ReportOptions): string {
  const limit = Math.max(1, Math.floor(opts.runs ?? DEFAULT_RUNS));
  const fmt = makeFmt(opts.timeZone ?? DEFAULT_TZ);
  const rows = db
    .prepare("SELECT id, kind, started_at, finished_at, stats_json, error FROM runs ORDER BY started_at DESC LIMIT ?")
    .all(limit);

  const out: string[] = [`# Events pipeline report`, "", `Generated ${fmt(opts.now.toISOString())}`, "", "## Runs", ""];
  let totalCost = 0;
  let discoverStats: Obj | null = null;
  let discoverAt = "";
  if (rows.length === 0) out.push("No runs recorded.");
  else {
    out.push(
      "| kind | started | duration s | ok | Haiku sessions | cost USD | searches | candidates | normalize rejected | ranked | published |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
    );
  }
  for (const r of rows) {
    const c = parseStats(r.stats_json);
    const startedAt = r.started_at == null ? null : String(r.started_at);
    const finishedAt = r.finished_at == null ? null : String(r.finished_at);
    const ms = startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : NaN;
    const status = r.error != null ? `error: ${esc(r.error).slice(0, 80)}` : finishedAt ? "ok" : "running";
    if (c.costUsd !== null) totalCost += c.costUsd;
    const parsed = parseJson(r.stats_json);
    if (!discoverStats && parsed && isObj(parsed.phaseMs)) {
      discoverStats = parsed;
      discoverAt = startedAt ?? "";
    }
    out.push(
      `| ${esc(r.kind)} | ${fmt(startedAt)} | ${Number.isFinite(ms) ? (ms / 1000).toFixed(1) : "-"} | ${status} | ${cell(c.haikuSessions)} | ${
        c.costUsd === null ? "-" : `$${c.costUsd.toFixed(4)}`
      } | ${cell(c.searches)} | ${cell(c.candidates)} | ${cell(c.normalizeRejected)} | ${cell(c.ranked)} | ${cell(c.published)} |`,
    );
  }

  out.push("", "## Where candidates were lost", "");
  if (!discoverStats) out.push("No run with discover stats.");
  else {
    const s: Obj = discoverStats;
    const phases = isObj(s.phaseMs)
      ? Object.entries(s.phaseMs)
          .map(([k, v]) => `${esc(k)} ${num(v) === null ? "-" : `${num(v)}ms`}`)
          .join(", ")
      : "-";
    out.push(
      `Run started ${fmt(discoverAt)}`,
      `- normalize reject reasons: ${topCounts(s.normalizeRejectReasons)}`,
      `- search failures: ${topCounts(s.searchFailures)}`,
      `- skipped by reason: ${topCounts(s.skippedByReason)}`,
      `- phase timings: ${phases}`,
    );
  }

  out.push("", "## Recommendations", "");
  const households = listHouseholds(db).filter((h) => !opts.householdId || h.id === opts.householdId);
  let published = 0;
  if (households.length === 0) out.push("No households.");
  for (const h of households) {
    out.push(`### Household ${esc(h.id)}`, "", `- last discovered: ${fmt(h.lastDiscoveredAt)}`, `- last triggered: ${fmt(h.lastTriggeredAt)}`, "");
    const recs = listRecommendationsForHousehold(db, h.id)
      .map((r) => ({ r, p: getPublishedRecommendation(db, h.id, r.eventId) }))
      .filter((x): x is { r: (typeof x)["r"]; p: NonNullable<(typeof x)["p"]> } => x.p !== null);
    published += recs.length;
    recs.sort((a, b) => Date.parse(a.p.event.schedule.start) - Date.parse(b.p.event.schedule.start));
    if (recs.length === 0) {
      out.push("No published recommendations.", "");
      continue;
    }
    out.push("| title | start | category | match | distance km | status | response |", "|---|---|---|---|---|---|---|");
    for (const { r, p } of recs.slice(0, MAX_RECS)) {
      out.push(
        `| ${esc(p.event.title)} | ${fmt(p.event.schedule.start)} | ${esc(p.event.category)} | ${p.matchScore.toFixed(2)} | ${
          p.distanceKm === undefined ? "-" : p.distanceKm.toFixed(1)
        } | ${esc(p.event.status)} | ${esc(r.response ?? "-")} |`,
      );
    }
    out.push("");
  }
  out.push(
    `Cost per published rec: ${
      published > 0 ? `$${(totalCost / published).toFixed(4)}` : "-"
    } (total $${totalCost.toFixed(4)} over ${rows.length} listed runs, ${published} published)`,
    "",
  );
  return out.join("\n");
}
