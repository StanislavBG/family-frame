import { describe, it, expect } from "vitest";
import type { PersonViewBlock } from "@shared/person-views";
import { parseViewRecord, viewTabId, sortViews, buildMetricsModel, buildListModel, buildChartPoints } from "./person-view";

type Rec = { id: string; data: unknown };
const rec = (id: string, data: unknown): Rec => ({ id, data });

describe("parseViewRecord", () => {
  it("returns the view with its id", () => {
    const v = parseViewRecord(rec("a", { title: "Reading", blocks: [{ type: "text", text: "hi" }] }));
    expect(v?.id).toBe("a");
    expect(v?.title).toBe("Reading");
    expect(v?.blocks).toHaveLength(1);
  });
  it("returns null for missing or invalid title/blocks and never throws", () => {
    expect(parseViewRecord(rec("a", { blocks: [] }))).toBeNull();
    expect(parseViewRecord(rec("a", { title: "x" }))).toBeNull();
    expect(parseViewRecord(rec("a", { title: "", blocks: [] }))).toBeNull();
    expect(parseViewRecord(rec("a", { title: "x", blocks: "nope" }))).toBeNull();
    expect(parseViewRecord(rec("a", null))).toBeNull();
    expect(parseViewRecord(rec("a", "str"))).toBeNull();
    expect(parseViewRecord(rec("a", [1]))).toBeNull();
    expect(parseViewRecord(undefined as unknown as Rec)).toBeNull();
  });
});

describe("viewTabId / sortViews", () => {
  it("prefixes the record id", () => {
    expect(viewTabId("abc")).toBe("v-abc");
  });
  it("sorts by order (missing = 50) then title", () => {
    const mk = (title: string, order?: number) => ({ id: title, title, order, blocks: [] });
    const sorted = sortViews([mk("Zed"), mk("Beta", 60), mk("Alpha"), mk("First", 0)]);
    expect(sorted.map((v) => v.title)).toEqual(["First", "Alpha", "Zed", "Beta"]);
  });
  it("does not mutate the input", () => {
    const input = [
      { id: "b", title: "B", blocks: [] },
      { id: "a", title: "A", blocks: [] },
    ];
    sortViews(input);
    expect(input[0].title).toBe("B");
  });
});

describe("buildMetricsModel", () => {
  const block: Extract<PersonViewBlock, { type: "metrics" }> = {
    type: "metrics",
    source: { schemaId: "s" },
    fields: [
      { field: "a", label: "A", unit: "kg" },
      { field: "nested.b", label: "B" },
      { field: "missing", label: "M" },
      { field: "nul", label: "N" },
      { field: "c", label: "C", tone: "plum" },
    ],
  };
  it("uses the newest record, skips null/undefined, formats numbers and units", () => {
    const m = buildMetricsModel(block, [
      rec("new", { a: 1234.5, nested: { b: "ok" }, nul: null, c: 3 }),
      rec("old", { a: 1, missing: "x" }),
    ]);
    expect(m.map((x) => x.label)).toEqual(["A", "B", "C"]);
    expect(m[0].value).toBe(`${(1234.5).toLocaleString()} kg`);
    expect(m[1].value).toBe("ok");
    expect(m[2].value).toBe("3");
  });
  it("defaults tones to the tile cycle by field position, honouring explicit tone", () => {
    const m = buildMetricsModel(block, [rec("r", { a: 1, nested: { b: 2 }, c: 3 })]);
    expect(m.map((x) => x.tone)).toEqual(["sun", "clay", "plum"]);
  });
  it("returns [] for no records", () => {
    expect(buildMetricsModel(block, [])).toEqual([]);
  });
});

describe("buildListModel", () => {
  const block: Extract<PersonViewBlock, { type: "list" }> = {
    type: "list",
    source: { schemaId: "s" },
    titleField: "t",
    subtitleField: "sub",
    dateField: "d",
  };
  it("maps records, stringifies scalars, ignores objects, skips empty titles", () => {
    const out = buildListModel(block, [
      rec("1", { t: "One", sub: 5, d: "2026-01-02" }),
      rec("2", { t: "" }),
      rec("3", { sub: "no title" }),
      rec("4", { t: 42, sub: { x: 1 } }),
      rec("5", { t: { x: 1 } }),
    ]);
    expect(out).toEqual([
      { id: "1", title: "One", subtitle: "5", date: "2026-01-02" },
      { id: "4", title: "42" },
    ]);
  });
  it("caps at limit, default 10", () => {
    const many = Array.from({ length: 15 }, (_, i) => rec(`r${i}`, { t: `T${i}` }));
    expect(buildListModel(block, many)).toHaveLength(10);
    expect(buildListModel({ ...block, limit: 3 }, many)).toHaveLength(3);
  });
  it("returns [] for no records", () => {
    expect(buildListModel(block, [])).toEqual([]);
  });
});

describe("buildChartPoints", () => {
  const block: Extract<PersonViewBlock, { type: "chart" }> = {
    type: "chart",
    source: { schemaId: "s", xField: "day", yField: "m.v" },
  };
  it("keeps finite numeric y and string x, sorted ascending", () => {
    const pts = buildChartPoints(block, [
      rec("1", { day: "2026-01-03", m: { v: 3 } }),
      rec("2", { day: "2026-01-01", m: { v: 1 } }),
      rec("3", { day: "2026-01-02", m: { v: "2" } }),
      rec("4", { day: "2026-01-04", m: { v: NaN } }),
      rec("5", { day: "2026-01-05", m: { v: Infinity } }),
      rec("6", { day: 7, m: { v: 1 } }),
      rec("7", { day: "2026-01-06" }),
    ]);
    expect(pts).toEqual([
      { t: "2026-01-01", value: 1 },
      { t: "2026-01-03", value: 3 },
    ]);
  });
  it("caps at limit (default 90), keeping the latest points", () => {
    const many = Array.from({ length: 100 }, (_, i) => rec(`r${i}`, { day: `d${String(i).padStart(3, "0")}`, m: { v: i } }));
    const all = buildChartPoints(block, many);
    expect(all).toHaveLength(90);
    expect(all[all.length - 1].t).toBe("d099");
    expect(buildChartPoints({ ...block, limit: 5 }, many)).toHaveLength(5);
  });
  it("returns [] for series sources and empty records", () => {
    expect(buildChartPoints({ type: "chart", source: { seriesId: "x" } }, [rec("1", { day: "a", m: { v: 1 } })])).toEqual([]);
    expect(buildChartPoints(block, [])).toEqual([]);
  });
});
