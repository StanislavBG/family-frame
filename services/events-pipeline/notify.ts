import { execFile } from "node:child_process";
import type { EventsDb } from "./db";

// Desktop notifications for the unattended timers. planNotices is pure; the
// caller loads/saves JobState around it and hands each Notice to sendNotice.
// Notices carry only ids, counts, costs and error text: no addresses,
// coordinates or tokens.

export type NotifyJob = "watch" | "discover" | "refresh" | "all";

export interface Notice {
  title: string;
  body: string;
  urgency: "low" | "normal" | "critical";
}

export interface JobState {
  failing: boolean;
  lastError: string | null;
  since: string | null;
  notifiedAt: string | null;
}

export type JobOutcome =
  | {
      ok: true;
      householdRuns?: {
        householdId: string;
        reason: string;
        published: number;
        candidates: number;
        costUsd?: number;
        error?: string;
      }[];
      summary?: { published: number; candidates: number; errors: number; costUsd?: number };
    }
  | { ok: false; error: string };

const REMINDER_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_CHARS = 300;
const SEND_TIMEOUT_MS = 5000;

const CLEARED: JobState = { failing: false, lastError: null, since: null, notifiedAt: null };

function clip(text: string): string {
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}...` : text;
}

function cost(costUsd: number | undefined): string {
  return costUsd === undefined ? "" : `, $${costUsd.toFixed(2)}`;
}

export function planNotices(
  job: NotifyJob,
  prev: JobState | null,
  outcome: JobOutcome,
  nowIso: string,
): { notices: Notice[]; next: JobState } {
  const before = prev ?? CLEARED;

  if (!outcome.ok) {
    const error = clip(outcome.error);
    if (!before.failing || before.lastError !== error) {
      return {
        notices: [{ title: `Events ${job} failed`, body: error, urgency: "critical" }],
        next: {
          failing: true,
          lastError: error,
          since: before.failing ? before.since : nowIso,
          notifiedAt: nowIso,
        },
      };
    }
    const last = before.notifiedAt ? Date.parse(before.notifiedAt) : NaN;
    if (Number.isNaN(last) || Date.parse(nowIso) - last >= REMINDER_MS) {
      return {
        notices: [
          {
            title: `Events ${job} still failing`,
            body: `Since ${before.since ?? nowIso}: ${error}`,
            urgency: "critical",
          },
        ],
        next: { ...before, notifiedAt: nowIso },
      };
    }
    return { notices: [], next: before };
  }

  const notices: Notice[] = [];
  if (before.failing) {
    notices.push({
      title: `Events ${job} recovered`,
      body: `Running again after failing since ${before.since ?? "earlier"}.`,
      urgency: "normal",
    });
  }
  for (const run of outcome.householdRuns ?? []) {
    const id = run.householdId.slice(0, 8);
    if (run.error) {
      notices.push({
        title: `Events household ${id} failed`,
        body: `${run.reason}: ${clip(run.error)}`,
        urgency: "critical",
      });
    } else {
      notices.push({
        title: `Events household ${id}`,
        body: `${run.reason}: published ${run.published} of ${run.candidates} candidates${cost(run.costUsd)}`,
        urgency: "normal",
      });
    }
  }
  if (job === "all" && outcome.summary) {
    const s = outcome.summary;
    notices.push({
      title: "Events daily run finished",
      body: `Published ${s.published} of ${s.candidates} candidates, ${s.errors} errors${cost(s.costUsd)}`,
      urgency: "low",
    });
  }
  return { notices, next: CLEARED };
}

const STATE_SQL = `CREATE TABLE IF NOT EXISTS notify_state (
  job TEXT PRIMARY KEY,
  failing INTEGER,
  last_error TEXT,
  since TEXT,
  notified_at TEXT
)`;

export function loadJobState(db: EventsDb, job: NotifyJob): JobState | null {
  db.exec(STATE_SQL);
  const row = db
    .prepare("SELECT failing, last_error, since, notified_at FROM notify_state WHERE job = ?")
    .get(job);
  if (!row) return null;
  return {
    failing: Number(row.failing) === 1,
    lastError: (row.last_error as string | null) ?? null,
    since: (row.since as string | null) ?? null,
    notifiedAt: (row.notified_at as string | null) ?? null,
  };
}

export function saveJobState(db: EventsDb, job: NotifyJob, state: JobState): void {
  db.exec(STATE_SQL);
  db.prepare(
    `INSERT INTO notify_state (job, failing, last_error, since, notified_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(job) DO UPDATE SET failing = excluded.failing, last_error = excluded.last_error,
       since = excluded.since, notified_at = excluded.notified_at`,
  ).run(job, state.failing ? 1 : 0, state.lastError, state.since, state.notifiedAt);
}

export type NotifySpawn = (command: string, args: string[], options: { timeout: number }) => unknown;

const defaultSpawn: NotifySpawn = (command, args, options) =>
  execFile(command, args, options, () => {
    // notify-send missing or no desktop session: nothing to do.
  });

/** Fire a desktop notification. Never throws; EVENTS_NOTIFY=off disables it. */
export function sendNotice(
  n: Notice,
  deps: { spawn?: NotifySpawn; env?: NodeJS.ProcessEnv } = {},
): void {
  const env = deps.env ?? process.env;
  if (env.EVENTS_NOTIFY === "off") return;
  const spawn = deps.spawn ?? defaultSpawn;
  try {
    const res = spawn(
      "notify-send",
      ["--app-name=Family Frame events", "-u", n.urgency, n.title, n.body],
      { timeout: SEND_TIMEOUT_MS },
    );
    if (res && typeof (res as Promise<unknown>).catch === "function") {
      (res as Promise<unknown>).catch(() => {});
    }
  } catch {
    // swallowed by contract
  }
}
