import { describe, expect, it } from "vitest";
import { nextFitScale } from "./fit-scale";

describe("nextFitScale", () => {
  it("shrinks tall content to fit", () => {
    expect(nextFitScale(800, 1000, 1)).toBe(0.8);
  });
  it("never grows above 1 or below the minimum", () => {
    expect(nextFitScale(1200, 900, 1)).toBe(1);
    expect(nextFitScale(1200, 900, 0.8)).toBe(1);
    expect(nextFitScale(300, 1000, 1)).toBe(0.6);
    expect(nextFitScale(300, 1000, 1, 0.5)).toBe(0.5);
  });
  it("ignores tiny changes and small growth to avoid oscillation", () => {
    expect(nextFitScale(800, 1001, 0.8)).toBe(0.8);
    expect(nextFitScale(800, 985, 0.8)).toBe(0.8);
    expect(nextFitScale(800, 900, 0.8)).toBe(0.889);
  });
  it("keeps the current scale for unmeasured sizes", () => {
    expect(nextFitScale(0, 900, 0.9)).toBe(0.9);
  });
});
