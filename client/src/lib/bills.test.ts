import { describe, it, expect } from "vitest";
import type { TimePoint, TimeSeries } from "@shared/time-series";
import {
  toBill, dueInText, payLabel, groupBills, dueBills, paidBills, todoBills, nextUpBills,
  attentionCount, paidLabel, checkSummary, money, shortMoney,
} from "./bills";
import type { Bill } from "./bills";

const TODAY = "2026-10-11";

function series(over: Partial<TimeSeries> = {}, annotations: Record<string, unknown> = {}): TimeSeries {
  return {
    id: "s1", title: "Power", description: "", summary: "", tags: ["utilities"], unit: "USD", color: null,
    annotations, createdAt: "", updatedAt: "", pointCount: 0, firstT: null, lastT: null, latest: null,
    ...over,
  };
}

const pt = (t: string, value: number, annotations?: Record<string, unknown>): TimePoint => ({ t, value, annotations });

function bill(annotations: Record<string, unknown>, sa: Record<string, unknown> = {}, over: Partial<TimeSeries> = {}): Bill {
  return toBill(series(over, sa), [pt("2026-10-01", 72, annotations)], TODAY);
}

function mk(id: string, tone: Bill["tone"], dueDate: string | null, what = id, group = "Bills"): Bill {
  return { ...toBill(series({ id, title: what }, { group }), [], TODAY), tone, dueDate, what, latestT: "2026-10-01" };
}

describe("toBill tone", () => {
  it("paid: no points", () => {
    const b = toBill(series(), [], TODAY);
    expect(b.tone).toBe("paid");
    expect(b.latest).toBeNull();
    expect(b.latestT).toBeNull();
    expect(b.dueDate).toBeNull();
  });
  it("paid: no valid dueDate", () => {
    expect(bill({}).tone).toBe("paid");
    expect(bill({ dueDate: "soon" }).tone).toBe("paid");
  });
  it("paid: paymentStatus paid", () => {
    expect(bill({ dueDate: "2026-10-20", paymentStatus: "paid", autopay: false }).tone).toBe("paid");
  });
  it("paid: paid true without autopay", () => {
    expect(bill({ dueDate: "2026-10-20", paid: true, autopay: false }).tone).toBe("paid");
    expect(bill({ dueDate: "2026-10-20", paid: true }).tone).toBe("paid");
  });
  it("autopay with paid=true and future due stays upcoming", () => {
    expect(bill({ dueDate: "2026-10-20", paid: true, autopay: true }).tone).toBe("ok");
  });
  it("paid: autopay with past due date", () => {
    expect(bill({ dueDate: "2026-10-05", autopay: true }).tone).toBe("paid");
  });
  it("check: past-due status or past due date", () => {
    expect(bill({ dueDate: "2026-10-20", paymentStatus: "past-due", autopay: false }).tone).toBe("check");
    expect(bill({ dueDate: "2026-10-05", autopay: false }).tone).toBe("check");
  });
  it("action: autopay false", () => {
    expect(bill({ dueDate: "2026-10-20", autopay: false }).tone).toBe("action");
  });
  it("check: autopay unknown", () => {
    expect(bill({ dueDate: "2026-10-20" }).tone).toBe("check");
  });
  it("soon / ok boundary at 7 days", () => {
    expect(bill({ dueDate: "2026-10-18", autopay: true }).tone).toBe("soon");
    expect(bill({ dueDate: "2026-10-19", autopay: true }).tone).toBe("ok");
    expect(bill({ dueDate: TODAY, autopay: true }).tone).toBe("soon");
  });
  it("autopay derived from paymentStatus", () => {
    expect(bill({ dueDate: "2026-10-20", paymentStatus: "autopay" }).autopay).toBe(true);
    expect(bill({ dueDate: "2026-10-20", paymentStatus: "autopay-scheduled" }).autopay).toBe(true);
    expect(bill({ dueDate: "2026-10-20", paymentStatus: "unknown" }).autopay).toBeNull();
    expect(bill({ dueDate: "2026-10-20", autopay: false, paymentStatus: "autopay" }).autopay).toBe(false);
  });
  it("reads only the latest point", () => {
    const b = toBill(
      series(),
      [pt("2026-10-01", 5, { dueDate: "2026-10-25", autopay: true }), pt("2026-09-01", 9, { dueDate: "2026-09-10", autopay: false })],
      TODAY,
    );
    expect(b.latest).toBe(5);
    expect(b.latestT).toBe("2026-10-01");
    expect(b.tone).toBe("ok");
  });
});

describe("toBill fields", () => {
  it("maps annotations with fallbacks", () => {
    const b = toBill(
      series({ title: "T", description: "n", color: "#123456" }, { category: "Electricity", vendorShort: "PUD", vendor: "Full PUD", group: "Utilities", setAside: true }),
      [], TODAY,
    );
    expect(b).toMatchObject({ what: "Electricity", name: "PUD", group: "Utilities", setAside: true, note: "n", color: "#123456" });
    const f = toBill(series({ title: "T" }, { vendor: "Full" }), [], TODAY, 8);
    expect(f).toMatchObject({ what: "T", name: "Full", group: "Bills", setAside: false, color: "#f4b942" });
    expect(toBill(series(), [], TODAY).name).toBe("");
  });
  it("palette by index", () => {
    expect(toBill(series(), [], TODAY, 1).color).toBe("#a83818");
  });
});

describe("dueInText", () => {
  it("branches", () => {
    expect(dueInText("2026-10-11", TODAY)).toBe("Today");
    expect(dueInText("2026-10-12", TODAY)).toBe("Tomorrow");
    expect(dueInText("2026-10-10", TODAY)).toBe("Was due yesterday");
    expect(dueInText("2026-10-06", TODAY)).toBe("Was due 5 days ago");
    expect(dueInText("2026-10-13", TODAY)).toBe("In 2 days");
    expect(dueInText("2026-11-07", TODAY)).toBe("In 27 days");
    expect(dueInText("2026-11-08", TODAY)).toBe("In 4 weeks");
    expect(dueInText("2026-12-11", TODAY)).toBe("In 9 weeks");
  });
});

describe("payLabel", () => {
  it("labels", () => {
    expect(payLabel(mk("a", "action", "2026-10-20"))).toBe("You pay this one");
    expect(payLabel({ ...mk("a", "check", "2026-10-20"), autopay: false })).toBe("You pay this one");
    expect(payLabel({ ...mk("a", "ok", "2026-10-20"), autopay: true })).toBe("Pays automatically");
    expect(payLabel({ ...mk("a", "check", "2026-10-20"), autopay: null })).toBe("Autopay? Not sure");
  });
});

describe("groupBills", () => {
  it("orders groups and falls back to Bills", () => {
    const bills = [
      mk("a", "ok", null, "a", "Zeta"), mk("b", "ok", null, "b", "Home"), mk("c", "ok", null, "c", "Alpha"),
      mk("d", "ok", null, "d", "Internet"), mk("e", "ok", null, "e", "Utilities"), mk("f", "ok", null, "f", "Utilities"),
      toBill(series({ id: "g" }), [], TODAY),
    ];
    const g = groupBills(bills);
    expect(g.map((x) => x.title)).toEqual(["Utilities", "Internet", "Home", "Alpha", "Bills", "Zeta"]);
    expect(g[0].items.map((b) => b.id)).toEqual(["e", "f"]);
  });
  it("omits empty groups", () => {
    expect(groupBills([])).toEqual([]);
    expect(groupBills([mk("a", "ok", null, "a", "Home")]).map((x) => x.title)).toEqual(["Home"]);
  });
});

describe("lists", () => {
  const bills = [
    mk("p1", "paid", null), mk("o2", "ok", "2026-10-30", "b"), mk("s1", "soon", "2026-10-14", "z"),
    mk("c1", "check", "2026-10-02"), mk("a1", "action", "2026-10-20"), mk("a0", "action", "2026-10-15"),
    mk("s0", "soon", "2026-10-14", "a"), mk("o1", "ok", "2026-11-05", "c"), mk("p2", "paid", null), mk("o0", "ok", "2026-10-25"),
  ];
  it("dueBills excludes paid, sorts by date then what", () => {
    expect(dueBills(bills).map((b) => b.id)).toEqual(["c1", "s0", "s1", "a0", "a1", "o0", "o2", "o1"]);
  });
  it("paidBills keeps input order", () => {
    expect(paidBills(bills).map((b) => b.id)).toEqual(["p1", "p2"]);
  });
  it("todoBills action first then check", () => {
    expect(todoBills(bills).map((b) => b.id)).toEqual(["a0", "a1", "c1"]);
  });
  it("nextUpBills soon/ok by date, first n", () => {
    expect(nextUpBills(bills).map((b) => b.id)).toEqual(["s1", "s0", "o0"]);
    expect(nextUpBills(bills, 5).map((b) => b.id)).toEqual(["s1", "s0", "o0", "o2", "o1"]);
  });
  it("attentionCount", () => {
    expect(attentionCount(bills)).toBe(3);
  });
});

describe("paidLabel", () => {
  it("uses dueDate when past, else billed date, else none", () => {
    expect(paidLabel(bill({ dueDate: "2026-10-05", paymentStatus: "paid" }), TODAY)).toBe("Paid Oct 5");
    expect(paidLabel(bill({ dueDate: "2026-10-20", paid: true }), TODAY)).toBe("Billed Oct 1");
    expect(paidLabel(toBill(series(), [], TODAY), TODAY)).toBe("No bills yet");
  });
});

describe("checkSummary", () => {
  const now = new Date(2026, 9, 11, 15, 0, 0);
  const s = (checkedAt?: string, severity?: string) =>
    series({}, checkedAt || severity ? { health: { checkedAt, severity } } : {});
  const local = (d: number, h: number) => new Date(2026, 9, d, h, 0, 0).toISOString();

  it("null without a valid checkedAt", () => {
    expect(checkSummary([], now)).toBeNull();
    expect(checkSummary([s(), s("garbage")], now)).toBeNull();
  });
  it("wording by age", () => {
    expect(checkSummary([s(local(11, 8)), s(local(11, 9))], now)).toBe("All 2 bills checked this morning");
    expect(checkSummary([s(local(11, 13))], now)).toBe("All 1 bill checked today");
    expect(checkSummary([s(local(10, 20)), s(local(11, 8))], now)).toBe("All 2 bills checked yesterday");
    expect(checkSummary([s(local(9, 8)), s(local(11, 8))], now)).toBe("All 2 bills checked on Oct 9");
  });
  it("needs a look on warn or alert", () => {
    expect(checkSummary([s(local(11, 8), "warn"), s(local(11, 8), "ok"), s(local(11, 8), "alert")], now)).toBe("2 bills need a look");
    expect(checkSummary([s(local(11, 8), "alert")], now)).toBe("1 bill needs a look");
  });
});

describe("money", () => {
  it("formats", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(72)).toBe("$72.00");
    expect(shortMoney(7712)).toBe("$7.7k");
    expect(shortMoney(1000)).toBe("$1.0k");
    expect(shortMoney(72.4)).toBe("$72");
    expect(shortMoney(999.6)).toBe("$1000");
  });
});
