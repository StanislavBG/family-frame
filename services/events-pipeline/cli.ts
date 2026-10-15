import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { finishRun, listDueForRecheck, openEventsDb, startRun, type EventsDb } from "./db";
import { runDiscover, type DiscoverStats } from "./discover";
import { runDispatch, type DispatchStats } from "./dispatch";
import { createFfClient, type FfClient } from "./ff-client";
import { createGeocoder, type Geocoder } from "./geo";
import { createHaikuRunner, type HaikuRunner, type HaikuUsage } from "./haiku";
import { loadJobState, planNotices, saveJobState, sendNotice, type JobOutcome, type Notice, type NotifyJob } from "./notify";
import { buildReport } from "./report";
import { runWatch, type WatchResult } from "./watch";

const MIN_NODE = [22, 13] as const;
const LOCK_STALE_MS = 3 * 3600000;
const DAY_MS = 86_400_000;
const DEFAULT_MAX_SESSIONS = 45;
const DEFAULT_WATCH_MAX_SESSIONS = 20;

export type Mode = "discover" | "refresh" | "all" | "watch" | "status" | "report";

export interface CliArgs {
  mode: Mode;
  dryRun: boolean;
  householdId?: string;
  maxSessions: number;
  runs?: number;
}

const MODES: readonly string[] = ["discover", "refresh", "all", "watch", "status", "report"];

export const USAGE = "usage: events:run <discover|refresh|all|watch|status|report> [--dry-run] [--household <id>] [--max-sessions <n>]\n       events:run report [--household <id>] [--runs <n>]";

/** Parse argv (without node and script). Throws an Error with a one-line message on bad input. */
export function parseArgs(argv: string[]): CliArgs {
  let mode: Mode | undefined;
  let dryRun = false;
  let householdId: string | undefined;
  let maxSessions: number | undefined;
  let runs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--household" || a.startsWith("--household=")) {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      if (!v || v.startsWith("--")) throw new Error("--household needs an id");
      householdId = v;
    } else if (a === "--max-sessions" || a.startsWith("--max-sessions=")) {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      if (!v || !/^\d+$/.test(v) || Number(v) < 1) throw new Error("--max-sessions needs a positive integer");
      maxSessions = Number(v);
    } else if (a === "--runs" || a.startsWith("--runs=")) {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      if (!v || !/^\d+$/.test(v) || Number(v) < 1) throw new Error("--runs needs a positive integer");
      runs = Number(v);
    } else if (MODES.includes(a)) {
      if (mode) throw new Error("only one mode may be given");
      mode = a as Mode;
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!mode) throw new Error("missing mode");
  const parsed: CliArgs = { mode, dryRun, householdId, maxSessions: maxSessions ?? (mode === "watch" ? DEFAULT_WATCH_MAX_SESSIONS : DEFAULT_MAX_SESSIONS) };
  if (runs !== undefined) parsed.runs = runs;
  return parsed;
}

export interface CliConfig {
  baseUrl: string;
  token: string;
  dbPath: string;
  nominatimUserAgent: string;
}

export function nodeVersionOk(version: string): boolean {
  const [maj, min] = version.split(".").map(Number);
  return maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
}

/** Read config from env; returns the first problem as a one-line message. status and report need no Family Frame config. */
export function readConfig(env: NodeJS.ProcessEnv, mode: Mode, home: string): CliConfig | string {
  const baseUrl = env.FF_BASE_URL?.trim() ?? "";
  const token = env.FF_SERVICE_TOKEN?.trim() ?? "";
  if (mode !== "status" && mode !== "report") {
    if (!baseUrl) return "missing config: FF_BASE_URL";
    if (!token) return "missing config: FF_SERVICE_TOKEN";
  }
  const dbPath = env.EVENTS_DB_PATH?.trim() || join(home, ".local/share/family-frame-events/events.db");
  return {
    baseUrl,
    token,
    dbPath,
    nominatimUserAgent: env.NOMINATIM_USER_AGENT?.trim() || `FamilyFrameEvents/1.0 (${baseUrl})`,
  };
}

/** Exclusive lock file; a lock older than 2 h is treated as stale and replaced. Returns a release fn or null if held. */
export function acquireLock(path: string, now: number = Date.now()): (() => void) | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return () => {
        try {
          unlinkSync(path);
        } catch {
          // already gone
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let age: number;
      try {
        age = now - statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (age <= LOCK_STALE_MS) return null;
      try {
        unlinkSync(path);
      } catch {
        // lost the race to another process; retry
      }
    }
  }
  return null;
}

/** Retry `acquireLock` up to `attempts` times, sleeping `intervalMs` between tries (no sleep after the last). */
export async function acquireLockWithWait(
  path: string,
  opts: { attempts: number; intervalMs: number; sleep: (ms: number) => Promise<void>; now: () => number },
): Promise<(() => void) | null> {
  for (let i = 0; i < opts.attempts; i++) {
    const release = acquireLock(path, opts.now());
    if (release) return release;
    if (i < opts.attempts - 1) await opts.sleep(opts.intervalMs);
  }
  return null;
}

const LOCK_WAIT_ATTEMPTS = 40;
const LOCK_WAIT_INTERVAL_MS = 30_000;

/** Usage accrued since `before` (the runner's meter is cumulative across discover and refresh in `all` mode). */
export function usageSince(now: HaikuUsage, before?: HaikuUsage): HaikuUsage {
  if (!before) return now;
  const failures = { ...now.failures };
  for (const k of Object.keys(failures) as (keyof HaikuUsage["failures"])[]) failures[k] -= before.failures[k] ?? 0;
  return {
    sessions: now.sessions - before.sessions,
    ok: now.ok - before.ok,
    refused: now.refused - before.refused,
    failures,
    costUsd: now.costUsd - before.costUsd,
    totalMs: now.totalMs - before.totalMs,
  };
}

export interface StatusReport {
  households: number;
  upcoming: { next14d: number; d15to30: number; d31to90: number; later: number };
  lastRuns: { kind: string; startedAt: string; finishedAt: string | null; ok: boolean }[];
}

/** Counts only: no addresses, tokens or event details. */
export function buildStatus(db: EventsDb, now: Date): StatusReport {
  const count = (sql: string, ...p: string[]): number => Number((db.prepare(sql).get(...p) as { n: number }).n);
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
  const base = "SELECT COUNT(*) AS n FROM events WHERE status != 'cancelled' AND start_at >= ?";
  const nowIso = now.toISOString();
  const c14 = count(`${base} AND start_at < ?`, nowIso, at(14));
  const c30 = count(`${base} AND start_at < ?`, at(14), at(30));
  const c90 = count(`${base} AND start_at < ?`, at(30), at(90));
  const later = count(base, at(90));
  const runs = db.prepare("SELECT kind, started_at, finished_at, error FROM runs ORDER BY started_at DESC LIMIT 5").all();
  return {
    households: count("SELECT COUNT(*) AS n FROM households"),
    upcoming: { next14d: c14, d15to30: c30, d31to90: c90, later },
    lastRuns: runs.map((r) => ({
      kind: String(r.kind),
      startedAt: String(r.started_at),
      finishedAt: r.finished_at == null ? null : String(r.finished_at),
      ok: r.finished_at != null && r.error == null,
    })),
  };
}

/** Plan, send and persist notices for one job outcome. Never throws: a notification problem must not change the exit code. */
function notifyOutcome(db: EventsDb, job: NotifyJob, outcome: JobOutcome, nowIso: string, notify: (n: Notice) => void): void {
  try {
    const { notices, next } = planNotices(job, loadJobState(db, job), outcome, nowIso);
    for (const n of notices) {
      try {
        notify(n);
      } catch {
        // a failed notification is not a pipeline failure
      }
    }
    saveJobState(db, job, next);
  } catch {
    // notify state unavailable; carry on
  }
}

export interface CliDeps {
  env?: NodeJS.ProcessEnv;
  home?: string;
  nodeVersion?: string;
  now?: () => Date;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  loadEnvFile?: (path: string) => void;
  openDb?: (path: string) => EventsDb;
  makeFf?: (cfg: CliConfig) => FfClient;
  makeRunner?: (opts: { maxSessions: number; cwd: string }) => HaikuRunner & { usage?(): HaikuUsage };
  makeGeocoder?: (db: EventsDb, userAgent: string) => Geocoder;
  runWatch?: typeof runWatch;
  notify?: (n: Notice) => void;
  tmpRoot?: string;
  sleep?: (ms: number) => Promise<void>;
}

/** Run the CLI; resolves to the process exit code (0 ok, 1 error, 2 bad usage or config). */
export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((l: string) => console.log(l));
  const err = deps.stderr ?? ((l: string) => console.error(l));
  const nodeVersion = deps.nodeVersion ?? process.versions.node;
  if (!nodeVersionOk(nodeVersion)) {
    err(`events-pipeline needs Node ${MIN_NODE.join(".")} or newer (found ${nodeVersion})`);
    return 2;
  }

  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }

  const env = deps.env ?? process.env;
  const envFile = env.EVENTS_ENV_FILE?.trim();
  if (envFile) {
    try {
      (deps.loadEnvFile ?? ((p: string) => process.loadEnvFile(p)))(envFile);
    } catch {
      err("cannot read the file named by EVENTS_ENV_FILE");
      return 2;
    }
  }

  const cfg = readConfig(env, args.mode, deps.home ?? homedir());
  if (typeof cfg === "string") {
    err(cfg);
    return 2;
  }

  const now = deps.now ?? (() => new Date());
  const open = deps.openDb ?? openEventsDb;
  mkdirSync(dirname(cfg.dbPath), { recursive: true, mode: 0o700 });

  if (args.mode === "status") {
    const db = open(cfg.dbPath);
    try {
      out(JSON.stringify({ status: buildStatus(db, now()) }));
      return 0;
    } finally {
      db.close();
    }
  }

  if (args.mode === "report") {
    const db = open(cfg.dbPath);
    try {
      out(buildReport(db, { now: now(), runs: args.runs, householdId: args.householdId }));
      return 0;
    } finally {
      db.close();
    }
  }

  const lockPath = `${cfg.dbPath}.lock`;
  const notify = deps.notify ?? sendNotice;
  let release: (() => void) | null;
  if (args.mode === "watch") {
    release = acquireLock(lockPath, now().getTime());
    if (!release) {
      out(JSON.stringify({ skipped: "locked" }));
      return 0;
    }
  } else {
    const waitStart = Date.now();
    release = await acquireLockWithWait(lockPath, {
      attempts: LOCK_WAIT_ATTEMPTS,
      intervalMs: LOCK_WAIT_INTERVAL_MS,
      sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: () => now().getTime(),
    });
    if (!release) {
      out(JSON.stringify({ skipped: "locked", waitedMs: Date.now() - waitStart }));
      try {
        notify({
          title: "Family Frame events: run skipped",
          body: `The ${args.mode} run gave up after waiting for the lock: another run held the lock the whole time, so nothing ran.`,
          urgency: "critical",
        });
      } catch {
        // a failing notice must not mask the exit code
      }
      return 1;
    }
  }
  const scratch = mkdtempSync(join(deps.tmpRoot ?? tmpdir(), "ff-events-"));
  let db: EventsDb | undefined;
  const t0 = Date.now();
  try {
    db = open(cfg.dbPath);
    const ff = (deps.makeFf ?? ((c) => createFfClient({ baseUrl: c.baseUrl, token: c.token })))(cfg);
    const openDbNow = db;
    const buildRunner = () => (deps.makeRunner ?? ((o) => createHaikuRunner(o)))({ maxSessions: args.maxSessions, cwd: scratch });
    const buildGeocoder = () => (deps.makeGeocoder ?? ((d, ua) => createGeocoder({ db: d, userAgent: ua })))(openDbNow, cfg.nominatimUserAgent);

    if (args.mode === "watch") {
      // Lazy: a tick with nothing pending must start no claude process and make no Nominatim call.
      let runnerInst: (HaikuRunner & { usage?(): HaikuUsage }) | undefined;
      let geocoderInst: Geocoder | undefined;
      const lazyRunner: HaikuRunner = { run: (input) => (runnerInst ??= buildRunner()).run(input) };
      const lazyGeocoder: Geocoder = { geocode: (q) => (geocoderInst ??= buildGeocoder()).geocode(q) };
      const result: WatchResult = await (deps.runWatch ?? runWatch)({
        db,
        ff,
        runner: lazyRunner,
        geocoder: lazyGeocoder,
        now: now(),
        runIdPrefix: `watch-${randomUUID()}`,
        dryRun: args.dryRun,
        limits: { maxSearches: args.maxSessions },
      });
      const haiku = runnerInst?.usage?.();
      if (result.runs.length > 0 && !args.dryRun) {
        const runId = startRun(db, "watch", now().toISOString());
        finishRun(db, runId, now().toISOString(), haiku ? { ...result, haiku } : result, result.runs.every((r) => r.error) ? "all households failed" : null);
      }
      if (!args.dryRun) {
        notifyOutcome(
          db,
          "watch",
          {
            ok: true,
            householdRuns: result.runs.map((r) => ({
              householdId: r.householdId,
              reason: r.reason,
              published: r.stats?.published ?? 0,
              candidates: r.stats?.candidates ?? 0,
              ...(r.error ? { error: r.error } : {}),
            })),
          },
          now().toISOString(),
          notify,
        );
      }
      out(JSON.stringify({ mode: "watch", listed: result.listed, pending: result.pending, deferred: result.deferred, runs: result.runs, ...(haiku ? { haiku } : {}) }));
      return 0;
    }

    const runner = buildRunner();
    const geocoder = buildGeocoder();
    const stats: { mode: Mode; dryRun: boolean; discover?: DiscoverStats; refresh?: DispatchStats | { due: number }; haiku?: HaikuUsage; ms?: number } = {
      mode: args.mode,
      dryRun: args.dryRun,
    };

    let afterDiscover: HaikuUsage | undefined;
    if (args.mode === "discover" || args.mode === "all") {
      const discoverRunId = randomUUID();
      stats.discover = await runDiscover({
        db,
        ff,
        runner,
        geocoder,
        now: now(),
        runId: discoverRunId,
        dryRun: args.dryRun,
        onlyHouseholdId: args.householdId,
        limits: { maxSearches: args.maxSessions },
      });
      afterDiscover = runner.usage?.();
      if (afterDiscover) finishRun(db, discoverRunId, now().toISOString(), { ...stats.discover, haiku: afterDiscover });
    }
    if (args.mode === "refresh" || args.mode === "all") {
      if (args.dryRun) {
        stats.refresh = { due: listDueForRecheck(db, now().toISOString(), args.maxSessions).length };
      } else {
        const runId = startRun(db, "refresh", now().toISOString());
        try {
          stats.refresh = await runDispatch({ db, runner, ff, now: now(), runId, maxChecks: args.maxSessions });
          const total = runner.usage?.();
          const refreshHaiku = total && usageSince(total, afterDiscover);
          finishRun(db, runId, now().toISOString(), refreshHaiku ? { ...stats.refresh, haiku: refreshHaiku } : stats.refresh);
        } catch (e) {
          finishRun(db, runId, now().toISOString(), null, (e as Error).message);
          throw e;
        }
      }
    }
    stats.haiku = runner.usage?.();
    stats.ms = Date.now() - t0;
    if (!args.dryRun) {
      const d = stats.discover;
      notifyOutcome(
        db,
        args.mode,
        {
          ok: true,
          summary: {
            published: d?.published ?? 0,
            candidates: d?.candidates ?? 0,
            errors: d?.errors ?? 0,
            ...(stats.haiku ? { costUsd: stats.haiku.costUsd } : {}),
          },
        },
        now().toISOString(),
        notify,
      );
    }
    out(JSON.stringify(stats));
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    err(`events-pipeline failed: ${message}`);
    if (db && !args.dryRun) {
      notifyOutcome(db, args.mode, { ok: false, error: message }, now().toISOString(), notify);
    }
    return 1;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
    rmSync(scratch, { recursive: true, force: true });
    release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
