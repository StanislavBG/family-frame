export interface BranchFacts {
  branch: string;
  ahead: number;
  dirty: boolean;
  openPrds: number;
  latestValidation: "verified" | "refuted" | "none";
  oldestCommitTime: number;
}

export interface ReleasePlan {
  merge: BranchFacts[];
  hold: Array<{ branch: string; reason: string }>;
  skip: Array<{ branch: string; reason: string }>;
  ignore: string[];
}

const EPIC_PREFIX = "sm-epic/";

export function epicIdOf(branch: string): string | null {
  if (!branch.startsWith(EPIC_PREFIX)) return null;
  const id = branch.slice(EPIC_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function parseValidationVerdict(markdown: string): "verified" | "refuted" | "none" {
  if (/^##\s.+\s—\sREFUTED/m.test(markdown)) return "refuted";
  if (/—\sVERIFIED/.test(markdown)) return "verified";
  return "none";
}

function isNeverMerged(branch: string): boolean {
  return (
    branch === "main" ||
    branch.startsWith("sm-job/") ||
    branch.startsWith("release/") ||
    branch.startsWith("tmp-")
  );
}

export function planRelease(branches: BranchFacts[], opts: { include?: string[] } = {}): ReleasePlan {
  const include = new Set(opts.include ?? []);
  const plan: ReleasePlan = { merge: [], hold: [], skip: [], ignore: [] };

  for (const facts of branches) {
    const { branch } = facts;
    if (facts.ahead === 0) {
      plan.ignore.push(branch);
    } else if (isNeverMerged(branch)) {
      plan.skip.push({ branch, reason: "never merged automatically" });
    } else if (epicIdOf(branch) === null && !include.has(branch)) {
      plan.skip.push({ branch, reason: "not an Epic branch (use --include <branch>)" });
    } else if (facts.dirty) {
      plan.hold.push({ branch, reason: "uncommitted changes in its worktree" });
    } else if (facts.openPrds > 0) {
      plan.hold.push({ branch, reason: `${facts.openPrds} open PRD(s) still queued` });
    } else if (facts.latestValidation === "refuted") {
      plan.hold.push({ branch, reason: "latest validation record has REFUTED PRDs" });
    } else {
      plan.merge.push(facts);
    }
  }

  plan.merge.sort((a, b) => a.oldestCommitTime - b.oldestCommitTime);
  return plan;
}
