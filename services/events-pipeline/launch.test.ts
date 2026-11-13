import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..", "..");
const launcherPath = join(here, "launch.mjs");
const cliPath = join(here, "cli.ts");

type EnsureBundle = (opts?: { outFile?: string }) => Promise<{ outFile: string; built: boolean }>;
async function loadLauncher(): Promise<{ ensureBundle: EnsureBundle }> {
  return import(pathToFileURL(launcherPath).href);
}

const dir = mkdtempSync(join(tmpdir(), "events-launch-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("ensureBundle builds once, reuses the bundle, and rebuilds when an input changes", async () => {
  const { ensureBundle } = await loadLauncher();
  const outFile = join(dir, "cli.mjs");
  let builds = 0;

  const first = await ensureBundle({ outFile });
  if (first.built) builds++;
  assert.equal(first.built, true);
  assert.equal(builds, 1);
  const meta = JSON.parse(readFileSync(`${outFile}.meta.json`, "utf8")) as { inputs: Record<string, unknown> };
  const inputs = Object.keys(meta.inputs);
  assert.ok(inputs.some((p) => p.endsWith("services/events-pipeline/cli.ts")));
  assert.ok(inputs.every((p) => !p.includes("node_modules")), "packages stay external");
  const mtime1 = statSync(outFile).mtimeMs;

  const second = await ensureBundle({ outFile });
  if (second.built) builds++;
  assert.equal(second.built, false);
  assert.equal(builds, 1);
  assert.equal(statSync(outFile).mtimeMs, mtime1);

  // Touch a recorded input (content unchanged) so it is newer than the bundle.
  const input = resolve(root, inputs.find((p) => p.endsWith("watch.ts")) ?? inputs[0]);
  while (Date.now() <= mtime1 + 5) await new Promise((r) => setTimeout(r, 5));
  const now = new Date();
  utimesSync(input, now, now);
  const third = await ensureBundle({ outFile });
  if (third.built) builds++;
  assert.equal(third.built, true);
  assert.equal(builds, 2);
  assert.ok(statSync(outFile).mtimeMs >= mtime1);

  const fourth = await ensureBundle({ outFile });
  assert.equal(fourth.built, false);
});

test("the launcher gives the same exit code and output as cli.ts under tsx", () => {
  const args = ["--not-a-mode"];
  const viaLauncher = spawnSync(process.execPath, [launcherPath, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const viaTsx = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
  assert.equal(viaTsx.status, 2, viaTsx.stderr);
  assert.equal(viaLauncher.status, viaTsx.status, viaLauncher.stderr);
  assert.equal(viaLauncher.stdout, viaTsx.stdout);
  assert.ok(viaLauncher.stderr.includes("unknown argument: --not-a-mode"), viaLauncher.stderr);
  // Node's loader warnings (e.g. the SQLite ExperimentalWarning) differ by loader; compare the CLI's own lines.
  const own = (s: string) => s.split("\n").filter((l) => l && !/Warning|--trace-warnings/.test(l));
  assert.deepEqual(own(viaLauncher.stderr), own(viaTsx.stderr));

  // The bundle must not auto-run main() on import: one run only, so usage prints once.
  assert.equal(viaLauncher.stderr.split("unknown argument").length - 1, 1);
});
