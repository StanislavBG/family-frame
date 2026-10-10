import { describe, it, expect } from "vitest";
import { togglePersonId, hostedStreamLabel } from "./photo-stream";

const people = [
  { id: "a", name: "Evolet" },
  { id: "b", name: "Mila" },
  { id: "c", name: "Sam" },
];

describe("togglePersonId", () => {
  it("adds and removes, keeping order", () => {
    expect(togglePersonId(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePersonId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("caps at 20", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(togglePersonId(ids, "extra")).toEqual(ids);
    expect(togglePersonId(ids, "p0")).toHaveLength(19);
  });
});

describe("hostedStreamLabel", () => {
  it("household and undefined", () => {
    expect(hostedStreamLabel("household", [], people)).toBe("Whole household");
    expect(hostedStreamLabel(undefined, undefined, people)).toBe("Whole household");
  });
  it("names people", () => {
    expect(hostedStreamLabel("people", ["a"], people)).toBe("Evolet");
    expect(hostedStreamLabel("people", ["a", "b"], people)).toBe("Evolet and Mila");
    expect(hostedStreamLabel("people", ["a", "b", "c"], people)).toBe("3 people");
  });
  it("ignores unknown ids and handles empty", () => {
    expect(hostedStreamLabel("people", ["zzz", "a"], people)).toBe("Evolet");
    expect(hostedStreamLabel("people", ["zzz"], people)).toBe("No one chosen");
    expect(hostedStreamLabel("people", [], people)).toBe("No one chosen");
    expect(hostedStreamLabel("people", undefined, people)).toBe("No one chosen");
  });
});
