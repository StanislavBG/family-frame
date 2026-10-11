import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHaikuRunner, HAIKU_MODEL, type HaikuChild, type HaikuSpawn } from "./haiku";

interface Call { command: string; args: string[]; stdin: string; signals: string[] }

function fakeSpawn(behave: (child: EventEmitter, call: Call) => void) {
  const calls: Call[] = [];
  const spawn: HaikuSpawn = (command, args) => {
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const call: Call = { command, args, stdin: "", signals: [] };
    calls.push(call);
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: (s: string) => { call.stdin += s; }, end: () => { setImmediate(() => behave(child, call)); } };
    child.kill = (sig?: string) => { call.signals.push(sig ?? "SIGTERM"); };
    return child as unknown as HaikuChild;
  };
  return { spawn, calls };
}

const reply = (child: EventEmitter, out: string, err = "", code = 0) => {
  (child as any).stdout.emit("data", Buffer.from(out));
  if (err) (child as any).stderr.emit("data", Buffer.from(err));
  child.emit("close", code);
};

const input = { prompt: "find events", jsonSchema: { type: "object" } };

test("argv pins model, limits tools, never --bare; prompt on stdin", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ result: "{}", structured_output: { a: 1 } })));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 3, cwd: "/tmp" });
  await r.run(input);
  const { args, stdin } = f.calls[0];
  assert.equal(stdin, "find events");
  assert.ok(args.includes("-p"));
  assert.equal(args[args.indexOf("--model") + 1], HAIKU_MODEL);
  assert.equal(HAIKU_MODEL, "claude-haiku-4-5-20251001");
  assert.equal(args[args.indexOf("--output-format") + 1], "json");
  assert.equal(args[args.indexOf("--json-schema") + 1], JSON.stringify(input.jsonSchema));
  assert.equal(args[args.indexOf("--tools") + 1], "WebSearch,WebFetch");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "WebSearch,WebFetch");
  for (const flag of ["--no-session-persistence", "--strict-mcp-config"]) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(!args.includes("--bare"));
  assert.ok(!args.join(" ").match(/Bash|Edit|Write/));
});

test("permission_denials in the envelope is a failure, counted under failed", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({
    structured_output: { candidates: [] },
    permission_denials: [{ tool_name: "WebSearch" }, { tool_name: "WebSearch" }, { tool_name: "WebFetch" }],
  })));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp" });
  const res = await r.run(input);
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "failed");
  assert.equal(res.ok === false && res.detail, "tool permission denied: WebSearch, WebFetch");
  assert.equal(r.usage().failures.failed, 1);
});

test("refuses write-capable tools without spawning", async () => {
  const f = fakeSpawn((c) => reply(c, "{}"));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 3, cwd: "/tmp" });
  const res = await r.run({ ...input, tools: ["Bash"] });
  assert.equal(res.ok, false);
  assert.equal(f.calls.length, 0);
});

test("prefers structured_output and reports cost", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ result: "ignored", structured_output: { x: 2 }, total_cost_usd: 0.01 })));
  const res = await createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp" }).run(input);
  assert.deepEqual(res, { ok: true, data: { x: 2 }, costUsd: 0.01 });
});

test("falls back to fenced result text", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ result: "```json\n{\"y\":3}\n```" })));
  const res = await createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp" }).run(input);
  assert.deepEqual(res, { ok: true, data: { y: 3 } });
});

test("unparseable output is bad-output", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ result: "not json" })));
  const res = await createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp" }).run(input);
  assert.equal(res.ok === false && res.reason, "bad-output");
});

test("rate limit latches: later runs are budget-exhausted without spawning", async () => {
  const f = fakeSpawn((c) => reply(c, "", "Claude usage limit reached", 1));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 5, cwd: "/tmp" });
  const first = await r.run(input);
  assert.equal(first.ok === false && first.reason, "rate-limited");
  const second = await r.run(input);
  assert.equal(second.ok === false && second.reason, "budget-exhausted");
  assert.equal(f.calls.length, 1);
});

test("rate limit in an error result is detected", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ is_error: true, result: "API Error: 429 rate limit" }), "", 1));
  const res = await createHaikuRunner({ spawn: f.spawn, maxSessions: 2, cwd: "/tmp" }).run(input);
  assert.equal(res.ok === false && res.reason, "rate-limited");
});

test("other non-zero exits are failed", async () => {
  const f = fakeSpawn((c) => reply(c, "", "boom", 2));
  const res = await createHaikuRunner({ spawn: f.spawn, maxSessions: 2, cwd: "/tmp" }).run(input);
  assert.equal(res.ok === false && res.reason, "failed");
});

test("session budget caps spawns", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ structured_output: {} })));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 2, cwd: "/tmp" });
  assert.equal((await r.run(input)).ok, true);
  assert.equal((await r.run(input)).ok, true);
  const third = await r.run(input);
  assert.equal(third.ok === false && third.reason, "budget-exhausted");
  assert.equal(f.calls.length, 2);
});

test("timeout sends SIGTERM then SIGKILL", async () => {
  const f = fakeSpawn(() => { /* never closes */ });
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp", timeoutMs: 20, killGraceMs: 20 });
  const res = await r.run(input);
  assert.equal(res.ok === false && res.reason, "timeout");
  assert.deepEqual(f.calls[0].signals, ["SIGTERM"]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(f.calls[0].signals, ["SIGTERM", "SIGKILL"]);
});

test("usage meters sessions, ok and cost", async () => {
  let n = 0;
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ structured_output: {}, total_cost_usd: ++n === 1 ? 0.01 : 0.02 })));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 5, cwd: "/tmp" });
  assert.equal(r.usage().sessions, 0);
  await r.run(input);
  await r.run(input);
  const u = r.usage();
  assert.equal(u.sessions, 2);
  assert.equal(u.ok, 2);
  assert.equal(u.refused, 0);
  assert.ok(Math.abs(u.costUsd - 0.03) < 1e-9);
  assert.ok(u.totalMs >= 0);
  assert.deepEqual(u.failures, { timeout: 0, "rate-limited": 0, "budget-exhausted": 0, "bad-output": 0, failed: 0 });
  u.sessions = 99;
  u.failures.failed = 99;
  assert.equal(r.usage().sessions, 2);
  assert.equal(r.usage().failures.failed, 0);
});

test("usage counts timeout and bad-output failures by reason", async () => {
  const hang = fakeSpawn(() => { /* never closes */ });
  const a = createHaikuRunner({ spawn: hang.spawn, maxSessions: 1, cwd: "/tmp", timeoutMs: 10, killGraceMs: 10 });
  await a.run(input);
  assert.equal(a.usage().failures.timeout, 1);
  assert.equal(a.usage().sessions, 1);
  assert.equal(a.usage().ok, 0);
  const bad = fakeSpawn((c) => reply(c, JSON.stringify({ result: "not json" })));
  const b = createHaikuRunner({ spawn: bad.spawn, maxSessions: 1, cwd: "/tmp" });
  await b.run(input);
  assert.equal(b.usage().failures["bad-output"], 1);
  assert.equal(b.usage().sessions, 1);
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("usage counts calls past maxSessions as refused, not sessions", async () => {
  const f = fakeSpawn((c) => reply(c, JSON.stringify({ structured_output: {} })));
  const r = createHaikuRunner({ spawn: f.spawn, maxSessions: 1, cwd: "/tmp" });
  await r.run(input);
  await r.run(input);
  await r.run({ ...input, tools: ["Bash"] });
  const u = r.usage();
  assert.equal(u.sessions, 1);
  assert.equal(u.refused, 2);
  assert.equal(u.failures["budget-exhausted"], 0);
});
