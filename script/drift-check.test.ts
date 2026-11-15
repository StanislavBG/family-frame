import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const scriptPath = path.join(here, "drift-check.cjs");

function run(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

test("a doc linking to a missing file is a broken-link finding (exit 1)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-check-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "# Doc\n\nSee [missing](missing.md).\n");
    const r = run(["--root", dir, "--file", "README.md"]);
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout) as { findings: { kind: string; target?: string }[] };
    assert.ok(
      report.findings.some((f) => f.kind === "broken-link"),
      `expected a broken-link finding, got ${r.stdout}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("docs/bilko-run.md in this repo has no findings (exit 0)", () => {
  const r = run(["--root", repoRoot, "--file", "docs/bilko-run.md"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("an unknown flag is a usage error (exit 2)", () => {
  const r = run(["--no-such-flag"]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
});
