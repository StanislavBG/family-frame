import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const scriptPath = path.join(here, "drift-check.cjs");

test("the repo's markdown network has no drift findings", () => {
  const r = spawnSync(
    process.execPath,
    [scriptPath, "--root", repoRoot, "--exclude", "session-manager-operations/"],
    { encoding: "utf8" },
  );
  let findings: unknown = r.stdout;
  try {
    findings = (JSON.parse(r.stdout) as { findings: unknown }).findings;
  } catch {
    // not JSON (usage error or crash): fall back to raw stdout
  }
  assert.equal(
    r.status,
    0,
    `drift-check exited ${r.status}; run \`npm run docs:check\`.\nfindings: ${JSON.stringify(findings, null, 2)}\n${r.stderr}`,
  );
});
