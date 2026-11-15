import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hand-kept inventories in the docs (MCP tool tables, env var list) drift from the code;
// this test fails `npm test` when a registered tool or a read env var is undocumented.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...tsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("every MCP tool registered in server/mcp.ts is documented", () => {
  const src = read("server/mcp.ts");
  const calls = src.match(/server\.registerTool\(/g)?.length ?? 0;
  const names = [...src.matchAll(/server\.registerTool\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

  assert.ok(calls > 0, "no server.registerTool( calls found in server/mcp.ts");
  assert.equal(
    names.length,
    calls,
    `server/mcp.ts has ${calls} server.registerTool( calls but only ${names.length} start with a quoted name; ` +
      `the parser is out of date with the registration shape`,
  );

  const docs = read("docs/agent-access.md") + "\n" + read("docs/time-series.md");
  const missing = names.filter((n) => !docs.includes("`" + n + "`"));
  assert.deepEqual(
    missing,
    [],
    `MCP tools missing from docs/agent-access.md and docs/time-series.md (expected in backticks): ${missing.join(", ")}`,
  );
});

test("every env var read in server/ and shared/ is documented in docs/operations.md", () => {
  const vars = new Set<string>();
  for (const dir of ["server", "shared"]) {
    for (const file of tsFiles(path.join(repoRoot, dir))) {
      for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) vars.add(m[1]);
    }
  }
  assert.ok(vars.size > 0, "no process.env reads found in server/ or shared/");

  const ops = read("docs/operations.md");
  const missing = [...vars].sort().filter((v) => !new RegExp(`(^|[^A-Z0-9_])${v}([^A-Z0-9_]|$)`).test(ops));
  assert.deepEqual(missing, [], `env vars read in server/ or shared/ but missing from docs/operations.md: ${missing.join(", ")}`);
});
