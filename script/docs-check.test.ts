import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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

// Counts only inline [text](target) links (images too) and <x.md> autolinks,
// outside code fences, HTML comments and inline code spans. Since v0.136.0,
// Session Manager's mdNetworkScan.cjs (Project Home's Review MD network) and
// drift-check's orphans check also follow backticked .md paths and @path.md
// imports. This test stays stricter, so every doc is reachable by clickable
// links (the maintaining-md-network skill prefers markdown links in rendered docs).
function linkTargets(markdown: string): string[] {
  const targets: string[] = [];
  let fence: string | null = null;
  let inComment = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch && !inComment) {
      fence = fenceMatch[1];
      continue;
    }
    let line = "";
    let i = 0;
    while (i < raw.length) {
      if (inComment) {
        const close = raw.indexOf("-->", i);
        if (close === -1) break;
        inComment = false;
        i = close + 3;
      } else {
        const open = raw.indexOf("<!--", i);
        if (open === -1) {
          line += raw.slice(i);
          break;
        }
        line += `${raw.slice(i, open)} `;
        inComment = true;
        i = open + 4;
      }
    }
    line = line.replace(/(`+)[^`]*?\1/g, " ");
    const outside = line
      .replace(/\]\(\s*(?:<([^>]*)>|([^\s)]*(?:\([^\s)]*\)[^\s)]*)*))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g, (_m, angle, bare) => {
      targets.push(angle ?? bare);
      return " ";
    });
    for (const m of outside.matchAll(/<([^<>\s]+)>/g)) {
      if (/\.md$/i.test(m[1].replace(/[?#].*$/, ""))) targets.push(m[1]);
    }
  }
  return targets;
}

function resolveDocLink(fromDoc: string, target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/") || target.startsWith("#")) return null;
  const bare = target.replace(/[?#].*$/, "");
  if (!/\.md$/i.test(bare)) return null;
  let decoded = bare;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // keep the raw path
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromDoc), decoded));
  return resolved.startsWith("../") ? null : resolved;
}

test("every tracked doc is reachable from CLAUDE.md by following links", () => {
  const ls = spawnSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(ls.status, 0, `git ls-files failed: ${ls.stderr}`);
  const docs = new Set(
    ls.stdout.split("\0").filter((f) => f && !f.startsWith("session-manager-operations/")),
  );
  const reached = new Set<string>(["CLAUDE.md"]);
  const queue = ["CLAUDE.md"];
  while (queue.length > 0) {
    const doc = queue.shift()!;
    const file = path.join(repoRoot, doc);
    if (!fs.existsSync(file)) continue;
    for (const target of linkTargets(fs.readFileSync(file, "utf8"))) {
      const next = resolveDocLink(doc, target);
      if (next && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  const unreachable = [...docs].filter((d) => !reached.has(d)).sort();
  assert.deepEqual(
    unreachable,
    [],
    `docs no link path from CLAUDE.md reaches (link them from CLAUDE.md's where-to-look table):\n${unreachable.join("\n")}`,
  );
});
