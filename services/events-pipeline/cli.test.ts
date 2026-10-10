import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, main, nodeVersionOk, parseArgs, type CliDeps } from "./cli";
import { openEventsDb } from "./db";
import type { FfClient } from "./ff-client";

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
