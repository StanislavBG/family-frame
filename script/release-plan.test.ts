import { test } from "node:test";
import assert from "node:assert/strict";
import { epicIdOf, parseValidationVerdict, planRelease, type BranchFacts } from "./release-plan";

function facts(branch: string, over: Partial<BranchFacts> = {}): BranchFacts {
  return {
    branch,
    ahead: 1,
    dirty: false,
    openPrds: 0,
    latestValidation: "verified",
    oldestCommitTime: 1000,
    ...over,
  };
}

test("epicIdOf extracts the id from sm-epic branches only", () => {
  assert.equal(epicIdOf("sm-epic/abc-123"), "abc-123");
  assert.equal(epicIdOf("sm-job/abc"), null);
  assert.equal(epicIdOf("main"), null);
  assert.equal(epicIdOf("sm-epic/"), null);
});

test("parseValidationVerdict reads heading lines", () => {
  assert.equal(parseValidationVerdict("## bills-model — VERIFIED\n"), "verified");
  assert.equal(parseValidationVerdict("## a — VERIFIED\n## b — REFUTED\n"), "refuted");
  assert.equal(parseValidationVerdict("# Report\nno verdicts here"), "none");
  assert.equal(parseValidationVerdict(""), "none");
});

test("ahead === 0 goes to ignore", () => {
  const plan = planRelease([facts("sm-epic/a", { ahead: 0 }), facts("main", { ahead: 0 })]);
  assert.deepEqual(plan.ignore, ["sm-epic/a", "main"]);
  assert.equal(plan.merge.length + plan.hold.length + plan.skip.length, 0);
});

test("non-Epic ahead branches are skipped unless included", () => {
  const reason = "not an Epic branch (use --include <branch>)";
  assert.deepEqual(planRelease([facts("feature/x")]).skip, [{ branch: "feature/x", reason }]);
  const included = planRelease([facts("feature/x")], { include: ["feature/x"] });
  assert.deepEqual(included.merge.map((b) => b.branch), ["feature/x"]);
  assert.equal(included.skip.length, 0);
});

test("never-merge names are skipped even when included, ignored when not ahead", () => {
  const names = ["main", "sm-job/1-x", "release/v1", "tmp-scratch"];
  const plan = planRelease(names.map((n) => facts(n)), { include: names });
  assert.equal(plan.merge.length, 0);
  assert.deepEqual(
    plan.skip,
    names.map((branch) => ({ branch, reason: "never merged automatically" })),
  );
  const idle = planRelease(names.map((n) => facts(n, { ahead: 0 })), { include: names });
  assert.deepEqual(idle.ignore, names);
});

test("holds use the exact first-matching reason", () => {
  const plan = planRelease([
    facts("sm-epic/dirty", { dirty: true, openPrds: 2, latestValidation: "refuted" }),
    facts("sm-epic/open", { openPrds: 3, latestValidation: "refuted" }),
    facts("sm-epic/refuted", { latestValidation: "refuted" }),
  ]);
  assert.deepEqual(plan.hold, [
    { branch: "sm-epic/dirty", reason: "uncommitted changes in its worktree" },
    { branch: "sm-epic/open", reason: "3 open PRD(s) still queued" },
    { branch: "sm-epic/refuted", reason: "latest validation record has REFUTED PRDs" },
  ]);
  assert.equal(plan.merge.length, 0);
});

test("validation 'none' does not hold a branch", () => {
  const plan = planRelease([facts("sm-epic/a", { latestValidation: "none" })]);
  assert.deepEqual(plan.merge.map((b) => b.branch), ["sm-epic/a"]);
});

test("include skips the Epic-name check but not the hold checks", () => {
  const plan = planRelease(
    [
      facts("feature/dirty", { dirty: true }),
      facts("feature/open", { openPrds: 1 }),
      facts("feature/refuted", { latestValidation: "refuted" }),
    ],
    { include: ["feature/dirty", "feature/open", "feature/refuted"] },
  );
  assert.equal(plan.merge.length, 0);
  assert.equal(plan.skip.length, 0);
  assert.deepEqual(plan.hold.map((h) => h.branch), ["feature/dirty", "feature/open", "feature/refuted"]);
});

test("merge is sorted oldest work first and keeps facts", () => {
  const plan = planRelease([
    facts("sm-epic/new", { oldestCommitTime: 300 }),
    facts("sm-epic/old", { oldestCommitTime: 100 }),
    facts("sm-epic/mid", { oldestCommitTime: 200 }),
  ]);
  assert.deepEqual(plan.merge.map((b) => b.branch), ["sm-epic/old", "sm-epic/mid", "sm-epic/new"]);
  assert.equal(plan.merge[0].oldestCommitTime, 100);
});
