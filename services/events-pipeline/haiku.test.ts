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
  for (const flag of ["--no-session-persistence", "--strict-mcp-config"]) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(!args.includes("--bare"));
  assert.ok(!args.join(" ").match(/Bash|Edit|Write/));
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
