import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, main, nodeVersionOk, parseArgs, type CliDeps } from "./cli";
import { openEventsDb, startRun, finishRun } from "./db";
import type { FfClient } from "./ff-client";
import type { Notice } from "./notify";
import type { WatchResult } from "./watch";

test("parseArgs reads modes and flags with defaults", () => {
  assert.deepEqual(parseArgs(["discover"]), { mode: "discover", dryRun: false, householdId: undefined, maxSessions: 25 });
  assert.deepEqual(parseArgs(["all", "--dry-run", "--household", "h1", "--max-sessions", "7"]), {
    mode: "all",
    dryRun: true,
    householdId: "h1",
    maxSessions: 7,
  });
  assert.equal(parseArgs(["status", "--max-sessions=3"]).maxSessions, 3);
  assert.throws(() => parseArgs([]), /missing mode/);
  assert.throws(() => parseArgs(["bogus"]), /unknown argument/);
  assert.throws(() => parseArgs(["refresh", "--max-sessions", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["refresh", "--household"]), /needs an id/);
});

test("nodeVersionOk gates on 22.13", () => {
  assert.equal(nodeVersionOk("22.12.0"), false);
  assert.equal(nodeVersionOk("22.13.0"), true);
  assert.equal(nodeVersionOk("24.0.1"), true);
  assert.equal(nodeVersionOk("20.19.0"), false);
});

function harness(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
  const lines: string[] = [];
  const errs: string[] = [];
  const deps: CliDeps = {
    env: { EVENTS_DB_PATH: join(dir, "data", "events.db"), ...env },
    home: dir,
    tmpRoot: dir,
    stdout: (l) => lines.push(l),
    stderr: (l) => errs.push(l),
    makeRunner: () => ({ run: async () => ({ ok: false, reason: "failed", detail: "fake" }) }),
    makeGeocoder: () => ({ geocode: async () => null }),
    makeFf: () => ({ listHouseholds: async () => [] }) as unknown as FfClient,
  };
  return { dir, lines, errs, deps };
}

test("missing config exits 2 with one line and no token leak", async () => {
  const h = harness({ FF_BASE_URL: "http://localhost:5000" });
  assert.equal(await main(["discover"], h.deps), 2);
  assert.equal(h.errs.length, 1);
  assert.match(h.errs[0], /FF_SERVICE_TOKEN/);
  const h2 = harness({});
  assert.equal(await main(["refresh"], h2.deps), 2);
  assert.match(h2.errs[0], /FF_BASE_URL/);
});

test("old node exits 2", async () => {
  const h = harness({});
  h.deps.nodeVersion = "20.0.0";
  assert.equal(await main(["status"], h.deps), 2);
  assert.match(h.errs[0], /Node 22\.13/);
});

test("lock contention exits 0 without running", async () => {
  const h = harness({ FF_BASE_URL: "http://localhost:5000", FF_SERVICE_TOKEN: "ff_svc_x" });
  let called = false;
  h.deps.makeFf = () => {
    called = true;
    return {} as FfClient;
  };
  const dbPath = h.deps.env!.EVENTS_DB_PATH!;
  assert.equal(await main(["status"], h.deps), 0); // creates the data dir
  writeFileSync(`${dbPath}.lock`, "1\n");
  h.lines.length = 0;
  assert.equal(await main(["discover"], h.deps), 0);
  assert.equal(called, false);
  assert.match(h.lines[0], /locked/);
  assert.ok(existsSync(`${dbPath}.lock`), "foreign lock left in place");
});

test("stale lock is replaced", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-lock-"));
  const p = join(dir, "x.lock");
  writeFileSync(p, "1\n");
  assert.equal(acquireLock(p), null);
  const old = new Date(Date.now() - 3 * 3600000);
  utimesSync(p, old, old);
  const release = acquireLock(p);
  assert.ok(release);
  release();
  assert.equal(existsSync(p), false);
});

test("dry run with fakes prints one stats line and releases the lock", async () => {
  const h = harness({ FF_BASE_URL: "http://localhost:5000", FF_SERVICE_TOKEN: "ff_svc_secret" });
  assert.equal(await main(["all", "--dry-run"], h.deps), 0);
  assert.equal(h.lines.length, 1);
  const stats = JSON.parse(h.lines[0]);
  assert.equal(stats.mode, "all");
  assert.equal(stats.dryRun, true);
  assert.equal(stats.discover.households, 0);
  assert.deepEqual(stats.refresh, { due: 0 });
  assert.ok(!h.lines[0].includes("ff_svc_secret"));
  assert.equal(existsSync(`${h.deps.env!.EVENTS_DB_PATH}.lock`), false);
});

test("status prints counts only", async () => {
  const h = harness({});
  assert.equal(await main(["status"], h.deps), 0);
  const { status } = JSON.parse(h.lines[0]);
  assert.equal(status.households, 0);
  assert.deepEqual(status.upcoming, { next14d: 0, d15to30: 0, d31to90: 0, later: 0 });
  assert.deepEqual(status.lastRuns, []);
  openEventsDb(h.deps.env!.EVENTS_DB_PATH!).close();
});

test("parseArgs accepts watch with a 12-session default", () => {
  assert.deepEqual(parseArgs(["watch"]), { mode: "watch", dryRun: false, householdId: undefined, maxSessions: 12 });
  assert.deepEqual(parseArgs(["watch", "--dry-run", "--max-sessions", "4"]), { mode: "watch", dryRun: true, householdId: undefined, maxSessions: 4 });
  assert.equal(parseArgs(["--max-sessions", "9", "watch"]).maxSessions, 9);
});

const WATCH_ENV = { FF_BASE_URL: "http://localhost:5000", FF_SERVICE_TOKEN: "ff_svc_x" };

test("watch skips with exit 0 when the lock is held", async () => {
  const h = harness(WATCH_ENV);
  let called = false;
  h.deps.makeFf = () => {
    called = true;
    return {} as FfClient;
  };
  const dbPath = h.deps.env!.EVENTS_DB_PATH!;
  assert.equal(await main(["status"], h.deps), 0);
  writeFileSync(`${dbPath}.lock`, "1\n");
  h.lines.length = 0;
  assert.equal(await main(["watch"], h.deps), 0);
  assert.equal(called, false);
  assert.deepEqual(JSON.parse(h.lines[0]), { skipped: "locked" });
});

test("watch tick with nothing pending never builds the runner or geocoder", async () => {
  const h = harness(WATCH_ENV);
  let built = 0;
  h.deps.makeRunner = () => {
    built++;
    return { run: async () => ({ ok: false, reason: "failed", detail: "x" }) };
  };
  h.deps.makeGeocoder = () => {
    built++;
    return { geocode: async () => null };
  };
  assert.equal(await main(["watch"], h.deps), 0);
  assert.equal(built, 0);
  assert.equal(h.lines.length, 1);
  assert.deepEqual(JSON.parse(h.lines[0]), { mode: "watch", listed: 0, pending: 0, deferred: 0, runs: [] });
  assert.equal(existsSync(`${h.deps.env!.EVENTS_DB_PATH}.lock`), false);
});

test("watch with a pending household calls runWatch and builds the runner lazily", async () => {
  const h = harness(WATCH_ENV);
  let built = 0;
  h.deps.makeRunner = () => {
    built++;
    return { run: async () => ({ ok: false, reason: "failed", detail: "x" }) };
  };
  let seenMax: number | undefined;
  h.deps.runWatch = async (opts) => {
    assert.equal(built, 0, "runner not built before first use");
    await opts.runner.run({} as never);
    seenMax = opts.limits?.maxSearches;
    return { listed: 1, pending: 1, deferred: 0, runs: [{ householdId: "h1", reason: "new" }] } satisfies WatchResult;
  };
  assert.equal(await main(["watch", "--max-sessions", "5"], h.deps), 0);
  assert.equal(built, 1);
  assert.equal(seenMax, 5);
  const out = JSON.parse(h.lines[0]);
  assert.equal(out.mode, "watch");
  assert.equal(out.pending, 1);
  const { status } = (await (async () => {
    const h2 = { ...h, lines: [] as string[] };
    h2.deps.stdout = (l) => h2.lines.push(l);
    await main(["status"], h2.deps);
    return JSON.parse(h2.lines[0]);
  })());
  assert.equal(status.lastRuns[0].kind, "watch");
});

test("watch failure prints one line and exits 1", async () => {
  const h = harness(WATCH_ENV);
  h.deps.runWatch = async () => {
    throw new Error("boom");
  };
  assert.equal(await main(["watch"], h.deps), 1);
  assert.equal(h.errs.length, 1);
  assert.match(h.errs[0], /boom/);
});

test("parseArgs accepts report with --runs and rejects bad values", () => {
  assert.equal(parseArgs(["report", "--runs", "3"]).runs, 3);
  assert.equal(parseArgs(["report"]).runs, undefined);
  assert.throws(() => parseArgs(["report", "--runs", "0"]), /--runs needs a positive integer/);
  assert.throws(() => parseArgs(["report", "--runs=x"]), /--runs needs a positive integer/);
});

test("report prints the markdown profile without FF env vars", async () => {
  const h = harness({});
  const dbPath = h.deps.env!.EVENTS_DB_PATH!;
  assert.equal(await main(["status"], h.deps), 0); // creates the data dir
  const db = openEventsDb(dbPath);
  const id = startRun(db, "discover", "2026-10-10T10:00:00.000Z");
  finishRun(db, id, "2026-10-10T10:01:00.000Z", { searches: 2 });
  db.close();
  h.lines.length = 0;
  assert.equal(await main(["report", "--runs", "5"], h.deps), 0);
  assert.equal(h.lines.length, 1);
  assert.match(h.lines[0], /## Runs/);
  assert.equal(h.errs.length, 0);
});

test("--runs 0 and --runs x exit 2 with usage", async () => {
  for (const bad of ["0", "x"]) {
    const h = harness({});
    assert.equal(await main(["report", "--runs", bad], h.deps), 2);
    assert.match(h.errs[0], /--runs needs a positive integer/);
  }
});

test("discover writes haiku usage into the runs row and stdout", async () => {
  const h = harness(WATCH_ENV);
  const usage = { sessions: 3, ok: 2, refused: 0, failures: { timeout: 1 }, costUsd: 0.12, totalMs: 900 };
  h.deps.makeRunner = () => ({
    run: async () => ({ ok: false, reason: "failed", detail: "x" }),
    usage: () => usage as never,
  });
  assert.equal(await main(["discover"], h.deps), 0);
  assert.deepEqual(JSON.parse(h.lines[0]).haiku, usage);
  const db = openEventsDb(h.deps.env!.EVENTS_DB_PATH!);
  const row = db.prepare("SELECT stats_json FROM runs WHERE kind = 'discover'").get() as { stats_json: string };
  db.close();
  assert.deepEqual(JSON.parse(row.stats_json).haiku, usage);
});

test("watch stats include haiku only when a runner was created", async () => {
  const h = harness(WATCH_ENV);
  const usage = { sessions: 1, ok: 1, refused: 0, failures: {}, costUsd: 0.01, totalMs: 10 };
  h.deps.makeRunner = () => ({ run: async () => ({ ok: false, reason: "failed", detail: "x" }), usage: () => usage as never });
  h.deps.runWatch = async (opts) => {
    await opts.runner.run({} as never);
    return { listed: 1, pending: 1, deferred: 0, runs: [{ householdId: "h1", reason: "new" }] } satisfies WatchResult;
  };
  assert.equal(await main(["watch"], h.deps), 0);
  assert.deepEqual(JSON.parse(h.lines[0]).haiku, usage);
  const db = openEventsDb(h.deps.env!.EVENTS_DB_PATH!);
  const row = db.prepare("SELECT stats_json FROM runs WHERE kind = 'watch'").get() as { stats_json: string };
  db.close();
  assert.deepEqual(JSON.parse(row.stats_json).haiku, usage);
});

function notifyHarness() {
  const h = harness(WATCH_ENV);
  const notices: Notice[] = [];
  h.deps.notify = (n) => notices.push(n);
  return { ...h, notices };
}

const oneRun = {
  listed: 1,
  pending: 1,
  deferred: 0,
  runs: [{ householdId: "household-abc", reason: "new", stats: { published: 4, candidates: 9 } }],
} as unknown as WatchResult;

test("watch with one household run sends one notice", async () => {
  const h = notifyHarness();
  h.deps.runWatch = async () => oneRun;
  assert.equal(await main(["watch"], h.deps), 0);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0].body, /published 4 of 9/);
});

test("idle watch sends no notice", async () => {
  const h = notifyHarness();
  assert.equal(await main(["watch"], h.deps), 0);
  assert.equal(h.notices.length, 0);
});

test("dry-run sends no notice and keeps notify state untouched", async () => {
  const h = notifyHarness();
  h.deps.runWatch = async () => oneRun;
  assert.equal(await main(["watch", "--dry-run"], h.deps), 0);
  assert.equal(await main(["all", "--dry-run"], h.deps), 0);
  assert.equal(h.notices.length, 0);
});

test("two consecutive identical failures send one notice", async () => {
  const h = notifyHarness();
  h.deps.runWatch = async () => {
    throw new Error("Invalid service token");
  };
  assert.equal(await main(["watch"], h.deps), 1);
  assert.equal(await main(["watch"], h.deps), 1);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].urgency, "critical");
  assert.match(h.notices[0].body, /Invalid service token/);
  assert.equal(h.errs.length, 2);
});

test("failure then success sends a recovered notice", async () => {
  const h = notifyHarness();
  h.deps.runWatch = async () => {
    throw new Error("boom");
  };
  assert.equal(await main(["watch"], h.deps), 1);
  h.deps.runWatch = async () => ({ listed: 0, pending: 0, deferred: 0, runs: [] });
  assert.equal(await main(["watch"], h.deps), 0);
  assert.equal(h.notices.length, 2);
  assert.match(h.notices[1].title, /recovered/);
});

test("a throwing notify never changes the exit code", async () => {
  const h = notifyHarness();
  h.deps.notify = () => {
    throw new Error("no dbus");
  };
  h.deps.runWatch = async () => oneRun;
  assert.equal(await main(["watch"], h.deps), 0);
});

test("discover sends no daily summary notice but all does", async () => {
  const h = notifyHarness();
  assert.equal(await main(["all"], h.deps), 0);
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0].title, /daily run finished/);
});
