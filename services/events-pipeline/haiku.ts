import { spawn as nodeSpawn } from "node:child_process";

// The only place the pipeline starts Claude sessions. Every call is `claude -p`
// on the operator's subscription (no --bare: that would bypass the login) with
// the model pinned to Haiku and only read-only web tools.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const DEFAULT_TIMEOUT_MS = 240000;
const KILL_GRACE_MS = 5000;
const RATE_LIMIT_RE = /rate[\s_-]?limit|usage[\s_-]?limit|too many requests|\b429\b/i;

export interface HaikuChild {
  stdin: { write(chunk: string): unknown; end(): unknown } | null;
  stdout: { on(event: "data", cb: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: "data", cb: (chunk: Buffer | string) => void): unknown } | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export type HaikuSpawn = (
  command: string,
  args: string[],
  options: { cwd: string },
) => HaikuChild;

export type HaikuFailureReason =
  | "timeout"
  | "rate-limited"
  | "budget-exhausted"
  | "bad-output"
  | "failed";

export type HaikuResult =
  | { ok: true; data: unknown; costUsd?: number }
  | { ok: false; reason: HaikuFailureReason; detail: string };

export interface HaikuRunInput {
  prompt: string;
  jsonSchema: unknown;
  tools?: string[];
}

export interface HaikuRunnerOptions {
  spawn?: HaikuSpawn;
  maxSessions: number;
  timeoutMs?: number;
  cwd: string;
  killGraceMs?: number;
}

export interface HaikuRunner {
  run(input: HaikuRunInput): Promise<HaikuResult>;
}

const FORBIDDEN_TOOLS = new Set(["Bash", "Edit", "Write", "NotebookEdit"]);

const fail = (reason: HaikuFailureReason, detail: string): HaikuResult => ({
  ok: false,
  reason,
  detail,
});

function stripFences(text: string): string {
  const trimmed = text.trim();
  const m = /^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return m ? m[1].trim() : trimmed;
}

function parseOutput(stdout: string): HaikuResult & { raw?: Record<string, unknown> } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return fail("bad-output", "claude stdout was not JSON");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return fail("bad-output", "claude output was not a result object");
  }
  const env = envelope as Record<string, unknown>;
  const costUsd = typeof env.total_cost_usd === "number" ? env.total_cost_usd : undefined;
  const withCost = (data: unknown): HaikuResult =>
    costUsd === undefined ? { ok: true, data } : { ok: true, data, costUsd };
  if (env.structured_output !== undefined && env.structured_output !== null) {
    return withCost(env.structured_output);
  }
  if (typeof env.result !== "string") {
    return fail("bad-output", "result has neither structured_output nor text");
  }
  try {
    return withCost(JSON.parse(stripFences(env.result)));
  } catch {
    return fail("bad-output", "result text was not valid JSON");
  }
}

export function createHaikuRunner(opts: HaikuRunnerOptions): HaikuRunner {
  const spawnFn: HaikuSpawn = opts.spawn ?? ((c, a, o) => nodeSpawn(c, a, { cwd: o.cwd, stdio: ["pipe", "pipe", "pipe"] }) as unknown as HaikuChild);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const killGraceMs = opts.killGraceMs ?? KILL_GRACE_MS;
  let started = 0;
  let rateLimited = false;

  async function run(input: HaikuRunInput): Promise<HaikuResult> {
    if (rateLimited) return fail("budget-exhausted", "stopped after rate limit");
    if (started >= opts.maxSessions) {
      return fail("budget-exhausted", `session budget of ${opts.maxSessions} used`);
    }
    const tools = input.tools ?? ["WebSearch", "WebFetch"];
    const bad = tools.find((t) => FORBIDDEN_TOOLS.has(t));
    if (bad) return fail("failed", `tool not allowed: ${bad}`);
    started += 1;

    const args = [
      "-p",
      "--model", HAIKU_MODEL,
      "--output-format", "json",
      "--json-schema", JSON.stringify(input.jsonSchema),
      "--tools", tools.join(","),
      "--no-session-persistence",
      "--strict-mcp-config",
      "--permission-mode", "dontAsk",
    ];

    return new Promise<HaikuResult>((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let killTimer: NodeJS.Timeout | undefined;
      let child: HaikuChild;

      const finish = (r: HaikuResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      };

      try {
        child = spawnFn(process.env.CLAUDE_BIN || "claude", args, { cwd: opts.cwd });
      } catch (err) {
        resolve(fail("failed", `spawn failed: ${(err as Error).message}`));
        return;
      }

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
        killTimer.unref?.();
        finish(fail("timeout", `no result within ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on("data", (c) => { stdout += c.toString(); });
      child.stderr?.on("data", (c) => { stderr += c.toString(); });
      child.on("error", (err) => finish(fail("failed", `spawn error: ${err.message}`)));
      child.on("close", (code) => {
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        let envelope: Record<string, unknown> | undefined;
        try {
          const j = JSON.parse(stdout);
          if (j && typeof j === "object" && !Array.isArray(j)) envelope = j as Record<string, unknown>;
        } catch { /* handled below */ }
        const isError = code !== 0 || envelope?.is_error === true;
        const resultText = typeof envelope?.result === "string" ? envelope.result : "";
        const haystack = isError ? `${stderr}\n${resultText}\n${envelope ? "" : stdout}` : stderr;
        if (RATE_LIMIT_RE.test(haystack)) {
          rateLimited = true;
          finish(fail("rate-limited", (stderr || resultText).trim().slice(0, 500)));
          return;
        }
        if (isError) {
          finish(fail("failed", `exit ${code}: ${(stderr || resultText || stdout).trim().slice(0, 500)}`));
          return;
        }
        finish(parseOutput(stdout));
      });

      child.stdin?.write(input.prompt);
      child.stdin?.end();
    });
  }

  return { run };
}
