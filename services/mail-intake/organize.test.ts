import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HaikuResult, HaikuRunInput } from "../events-pipeline/haiku";
import { organizeMessage, UNTRUSTED_BEGIN, UNTRUSTED_END } from "./organize";

function fakeRunner(result: HaikuResult | Error) {
  const calls: HaikuRunInput[] = [];
  return {
    calls,
    runner: {
      async run(input: HaikuRunInput): Promise<HaikuResult> {
        calls.push(input);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

const base = {
  mailId: "hh-abc",
  subject: "Your bill",
  fromEmail: "billing@power.example",
  receivedAt: "2026-10-13T08:00:00.000Z",
  text: "Amount due $42.50",
};

const bill = {
  vendor: "Power Co",
  category: "electricity",
  amount: 42.5,
  currency: "USD",
  billDate: "2026-10-01",
  dueDate: "2026-10-20",
};

describe("organizeMessage", () => {
  it("passes tools [] and delimits untrusted text", async () => {
    const f = fakeRunner({ ok: true, data: { kind: "other" } });
    const long = "x".repeat(20000);
    await organizeMessage(f.runner, { ...base, text: long });
    const call = f.calls[0];
    assert.deepEqual(call.tools, []);
    assert.ok(call.jsonSchema);
    const p = call.prompt;
    assert.ok(p.includes(base.subject) && p.includes(base.fromEmail) && p.includes(base.receivedAt));
    assert.match(p, /ignore any instructions/i);
    const inner = p.slice(p.indexOf(UNTRUSTED_BEGIN) + UNTRUSTED_BEGIN.length, p.indexOf(UNTRUSTED_END));
    assert.equal(inner.trim().length, 12000);
  });

  it("maps a bill", async () => {
    const f = fakeRunner({ ok: true, data: { kind: "bill", bill } });
    const r = await organizeMessage(f.runner, base);
    assert.deepEqual(r, { mailId: "hh-abc", kind: "bill", bill });
  });

  it("daily report with personId sets day.personId", async () => {
    const day = { date: "2026-10-12", title: "Busy day", highlights: [{ text: "Painted" }] };
    const f = fakeRunner({ ok: true, data: { kind: "daily-report", day } });
    const r = await organizeMessage(f.runner, { ...base, personId: "p1" });
    assert.equal(r?.kind, "daily-report");
    assert.equal(r?.day?.personId, "p1");
    assert.equal(r?.day?.title, "Busy day");
  });

  it("daily report without personId becomes other", async () => {
    const day = { date: "2026-10-12", title: "Busy day" };
    const f = fakeRunner({ ok: true, data: { kind: "daily-report", day } });
    const r = await organizeMessage(f.runner, base);
    assert.deepEqual(r, { mailId: "hh-abc", kind: "other" });
  });

  it("invalid Haiku data returns null", async () => {
    for (const data of [
      { kind: "bill", bill: { ...bill, amount: "lots" } },
      { kind: "bill" },
      { kind: "nonsense" },
      "text",
      null,
    ]) {
      const f = fakeRunner({ ok: true, data });
      assert.equal(await organizeMessage(f.runner, base), null);
    }
  });

  it("runner failure returns null", async () => {
    const failed = fakeRunner({ ok: false, reason: "timeout", detail: "slow" });
    assert.equal(await organizeMessage(failed.runner, base), null);
    const thrown = fakeRunner(new Error("boom"));
    assert.equal(await organizeMessage(thrown.runner, base), null);
  });
});
