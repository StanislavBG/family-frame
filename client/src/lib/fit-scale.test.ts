import { describe, expect, it } from "vitest";
import { INITIAL_FIT, fitCount, nextFitScale, stepFitScale, type FitState } from "./fit-scale";

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

describe("fitCount", () => {
  it("counts whole items that fit", () => {
    expect(fitCount(1000, 220, 8)).toBe(4);
  });
  it("handles the exact boundary", () => {
    expect(fitCount(448, 220, 8)).toBe(2);
    expect(fitCount(447, 220, 8)).toBe(1);
  });
  it("never returns below 1", () => {
    expect(fitCount(0, 220, 8)).toBe(1);
    expect(fitCount(NaN, 220, 8)).toBe(1);
    expect(fitCount(-50, 220, 8)).toBe(1);
  });
});

// Layout whose natural height depends on the scale: wider layout (low scale) wraps less.
function simulate(hiScale: number, loScale: number, avail: number, tall: number, short: number, state: FitState = INITIAL_FIT, steps = 24) {
  const mid = (hiScale + loScale) / 2;
  const natural = (s: number) => (s > mid ? tall : short);
  const history: number[] = [];
  let st = state;
  for (let i = 0; i < steps; i++) {
    st = stepFitScale(st, avail, natural(st.scale));
    history.push(st.scale);
  }
  return { st, history };
}

describe("stepFitScale", () => {
  // at the higher scale the layout is tall (fits only at lo); at the lower scale it is short (fits at hi): a flip
  for (const [hi, lo] of [[0.938, 0.895], [0.8, 0.75], [0.85, 0.7]]) {
    it(`settles on the lower scale for a flip ${hi} / ${lo}`, () => {
      const avail = 1000;
      const { history } = simulate(hi, lo, avail, avail / lo, avail / hi);
      const settled = history[3];
      expect(history.slice(3).every((s) => s === settled)).toBe(true);
      expect(settled).toBeCloseTo(lo, 2);
    });
  }

  it("lets the scale grow when content gets 10% shorter", () => {
    const avail = 1000;
    const { st } = simulate(0.938, 0.895, avail, avail / 0.895, avail / 0.938);
    const next = stepFitScale(st, avail, (avail / 0.895) * 0.8);
    expect(next.scale).toBeGreaterThan(st.scale);
  });

  it("clears the settled state when available height changes", () => {
    const avail = 1000;
    const { st } = simulate(0.938, 0.895, avail, avail / 0.895, avail / 0.938);
    expect(st.lock).not.toBeNull();
    const next = stepFitScale(st, avail + 100, (avail + 100) / 0.8);
    expect(next.lock).toBeNull();
  });

  it("still shrinks when content grows while settled, and re-measures", () => {
    const avail = 1000;
    const { st } = simulate(0.938, 0.895, avail, avail / 0.895, avail / 0.938);
    const grown = stepFitScale(st, avail, (avail / 0.895) * 1.3);
    expect(grown.scale).toBeLessThan(st.scale);
    expect(grown.lock?.natural).toBeNull();
  });

  it("ignores unmeasured sizes", () => {
    expect(stepFitScale(INITIAL_FIT, 0, 900)).toBe(INITIAL_FIT);
  });
});
