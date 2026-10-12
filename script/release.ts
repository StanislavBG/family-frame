import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { epicIdOf, parseValidationVerdict, planRelease, type BranchFacts } from "./release-plan";

const GATE_TIMEOUT_MS = 15 * 60 * 1000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noPush = args.includes("--no-push");
const include: string[] = [];
args.forEach((a, i) => {
  if (a === "--include" && args[i + 1]) include.push(args[i + 1]);
});

function git(cwd: string, gitArgs: string[]): string {
  console.log(`$ git ${gitArgs.join(" ")}`);
  return execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function gitQuiet(cwd: string, gitArgs: string[]): string {
  return execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitOk(cwd: string, gitArgs: string[]): boolean {
  try {
    gitQuiet(cwd, gitArgs);
    return true;
  } catch {
    return false;
  }
}

function errText(e: unknown): string {
  const err = e as { stderr?: Buffer | string; message?: string };
  return (err.stderr?.toString() || err.message || String(e)).trim();
}

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

function mainCheckout(): { root: string; worktrees: Map<string, string> } {
  const out = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
  let root = "";
  const worktrees = new Map<string, string>();
  let current = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = line.slice("worktree ".length);
      if (!root) root = current;
    } else if (line.startsWith("branch refs/heads/")) {
      worktrees.set(line.slice("branch refs/heads/".length), current);
    }
  }
  if (!root) fail("could not locate the main checkout");
  return { root, worktrees };
}

function newestValidation(root: string, epicId: string): string {
  const dir = path.join(root, "session-manager-operations/reviews/validation", epicId);
  if (!existsSync(dir)) return "";
  const files = readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => statSync(f).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files.length ? readFileSync(files[0], "utf8") : "";
}

function gatherFacts(root: string, worktrees: Map<string, string>): BranchFacts[] {
  const branches = gitQuiet(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
    .split("\n")
    .filter(Boolean);
  return branches.map((branch) => {
    const ahead = Number(gitQuiet(root, ["rev-list", "--count", `main..${branch}`]));
    const times = gitQuiet(root, ["log", "--format=%ct", `main..${branch}`]).split("\n").filter(Boolean);
    const oldestCommitTime = times.length ? Number(times[times.length - 1]) : 0;
    const wt = worktrees.get(branch);
    const dirty = wt ? gitQuiet(wt, ["status", "--porcelain", "--untracked-files=no"]) !== "" : false;

    let openPrds = 0;
    let latestValidation: BranchFacts["latestValidation"] = "none";
    const epicId = epicIdOf(branch);
    if (epicId) {
      const prdDir = path.join(root, "session-manager-operations/scheduler/epics", epicId, "prds");
      if (existsSync(prdDir)) openPrds = readdirSync(prdDir).filter((f) => f.endsWith(".md")).length;

      const verdicts = [parseValidationVerdict(newestValidation(root, epicId))];
      const treeDir = `session-manager-operations/reviews/validation/${epicId}/`;
      const files = gitQuiet(root, ["ls-tree", "-r", "--name-only", branch, "--", treeDir]).split("\n").filter(Boolean);
      for (const f of files) verdicts.push(parseValidationVerdict(gitQuiet(root, ["show", `${branch}:${f}`])));
      latestValidation = verdicts.includes("refuted")
        ? "refuted"
        : verdicts.includes("verified")
          ? "verified"
          : "none";
    }
    return { branch, ahead, dirty, openPrds, latestValidation, oldestCommitTime };
  });
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runGate(cwd: string): { ok: boolean; step: string; tail: string } {
  for (const step of ["check", "test"]) {
    console.log(`$ npm run ${step}`);
    const r = spawnSync("npm", ["run", step], {
      cwd,
      encoding: "utf8",
      timeout: GATE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.status !== 0) {
      return { ok: false, step: `npm run ${step}`, tail: output.split("\n").slice(-40).join("\n") };
    }
    console.log(output.split("\n").slice(-10).join("\n"));
  }
  return { ok: true, step: "", tail: "" };
}

function commitList(root: string, branch: string): string {
  return gitQuiet(root, ["log", "--oneline", `main..${branch}`]);
}

function main(): number {
  const { root, worktrees } = mainCheckout();
  console.log(`Main checkout: ${root}`);

  const onMain = gitQuiet(root, ["rev-parse", "--abbrev-ref", "HEAD"]) === "main";
  if (onMain && gitQuiet(root, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    fail("main checkout has uncommitted tracked changes; commit or discard them before releasing");
  }

  if (!dryRun) {
    try {
      git(root, ["fetch", "origin"]);
    } catch (e) {
      fail(`git fetch origin failed: ${errText(e)}`);
    }
  }
  const hasOrigin = gitOk(root, ["rev-parse", "--verify", "origin/main"]);
  if (hasOrigin && !gitOk(root, ["merge-base", "--is-ancestor", "origin/main", "main"])) {
    if (!gitOk(root, ["merge-base", "--is-ancestor", "main", "origin/main"])) {
      fail("main has diverged from origin/main and cannot be fast-forwarded; reconcile them manually");
    }
    if (!dryRun) {
      try {
        if (onMain) git(root, ["merge", "--ff-only", "origin/main"]);
        else git(root, ["fetch", ".", "origin/main:main"]);
      } catch (e) {
        fail(`could not fast-forward main to origin/main: ${errText(e)}`);
      }
    } else {
      console.log("(dry run) main is behind origin/main; a real run would fast-forward it");
    }
  }

  const facts = gatherFacts(root, worktrees);
  const plan = planRelease(facts, { include });

  console.log("\n## Plan");
  console.log(`merge (${plan.merge.length}):`);
  for (const f of plan.merge) {
    console.log(`  - ${f.branch} (${f.ahead} commit(s), validation: ${f.latestValidation})`);
    for (const l of commitList(root, f.branch).split("\n").filter(Boolean)) console.log(`      ${l}`);
  }
  console.log(`hold (${plan.hold.length}):`);
  for (const h of plan.hold) console.log(`  - ${h.branch}: ${h.reason}`);
  console.log(`skip (${plan.skip.length}):`);
  for (const s of plan.skip) console.log(`  - ${s.branch}: ${s.reason}`);

  if (dryRun) {
    console.log("\nDry run: nothing changed.");
    return 0;
  }

  const ts = stamp();
  const relBranch = `release/${ts}`;
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), "ff-release-")), "wt");
  let created = false;
  try {
    git(root, ["worktree", "add", "-b", relBranch, tmp, "main"]);
    created = true;
    symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"), "dir");

    const merged: Array<{ branch: string; commits: string }> = [];
    const held = plan.hold.map((h) => ({ ...h }));
    for (const f of plan.merge) {
      const commits = commitList(root, f.branch);
      try {
        git(tmp, ["merge", "--no-ff", "--no-edit", f.branch]);
        merged.push({ branch: f.branch, commits });
      } catch {
        console.log(`merge conflict in ${f.branch}; aborting that merge`);
        try {
          git(tmp, ["merge", "--abort"]);
        } catch (e) {
          throw new Error(`could not abort merge of ${f.branch}: ${errText(e)}`);
        }
        held.push({ branch: f.branch, reason: "merge conflict" });
      }
    }

    const mainSha = gitQuiet(root, ["rev-parse", "main"]);
    const originSha = hasOrigin ? gitQuiet(root, ["rev-parse", "origin/main"]) : "";
    if (merged.length === 0 && mainSha === originSha) {
      console.log("Nothing to publish");
      return 0;
    }

    const gate = runGate(tmp);
    if (!gate.ok) {
      console.error(`\nrelease: ${gate.step} failed in the temp worktree; nothing pushed.\n${gate.tail}`);
      return 1;
    }

    if (onMain) git(root, ["merge", "--ff-only", relBranch]);
    else git(root, ["fetch", ".", `${relBranch}:main`]);
    const sha = gitQuiet(root, ["rev-parse", "main"]);
    if (noPush) console.log("--no-push: skipping git push");
    else git(root, ["push", "origin", "main"]);

    console.log("\n# Release summary\n");
    console.log("## Merged");
    if (merged.length === 0) console.log("- (none)");
    for (const m of merged) {
      console.log(`- ${m.branch}`);
      for (const l of m.commits.split("\n").filter(Boolean)) console.log(`  - ${l}`);
    }
    console.log("\n## Held");
    if (held.length === 0) console.log("- (none)");
    for (const h of held) console.log(`- ${h.branch}: ${h.reason}`);
    console.log("\n## Skipped");
    if (plan.skip.length === 0) console.log("- (none)");
    for (const s of plan.skip) console.log(`- ${s.branch}: ${s.reason}`);
    console.log(`\n${noPush ? "Local main" : "Pushed"}: ${sha}`);
    console.log("\nNext: pull + Publish in Replit.");
    return 0;
  } finally {
    if (created) {
      try {
        git(root, ["worktree", "remove", "--force", tmp]);
      } catch (e) {
        console.error(`cleanup: worktree remove failed: ${errText(e)}`);
      }
      try {
        git(root, ["branch", "-D", relBranch]);
      } catch (e) {
        console.error(`cleanup: branch delete failed: ${errText(e)}`);
      }
    }
  }
}

process.exitCode = main();
