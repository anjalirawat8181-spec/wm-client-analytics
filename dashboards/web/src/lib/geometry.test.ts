import { describe, expect, it } from "vitest";
import { linePath, linearScale, nearestIndex, niceTicks, spreadLabels } from "./geometry";

describe("linearScale", () => {
  it("maps the domain onto the range", () => {
    const s = linearScale(0, 10, 100, 200);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(150);
    expect(s(10)).toBe(200);
  });
  it("does not divide by zero for a flat domain", () => {
    expect(Number.isFinite(linearScale(3, 3, 0, 10)(3))).toBe(true);
  });
});

describe("niceTicks", () => {
  it("returns round steps inside the range", () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 0.02, 4)).toEqual([0, 0.005, 0.01, 0.015, 0.02]);
  });
  it("handles degenerate input", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});

describe("nearestIndex", () => {
  it("finds the closest position", () => {
    expect(nearestIndex(12, [0, 10, 20, 30])).toBe(1);
    expect(nearestIndex(26, [0, 10, 20, 30])).toBe(3);
    expect(nearestIndex(-5, [0, 10])).toBe(0);
  });
});

describe("spreadLabels", () => {
  it("keeps labels apart and in the original order", () => {
    const out = spreadLabels([50, 52, 51], 12, 0, 200);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBeGreaterThanOrEqual(12);
    expect(sorted[2]! - sorted[1]!).toBeGreaterThanOrEqual(12);
    expect(out[0]!).toBeLessThan(out[2]!);
    expect(out[2]!).toBeLessThan(out[1]!);
  });
  it("pulls labels back inside the upper bound", () => {
    const out = spreadLabels([190, 195], 12, 0, 200);
    expect(Math.max(...out)).toBeLessThanOrEqual(200);
  });
});

describe("linePath", () => {
  it("breaks the line at missing values", () => {
    expect(linePath([0, 10, 20], [5, null, 7])).toBe("M0.0,5.0M20.0,7.0");
    expect(linePath([0, 10], [1, 2])).toBe("M0.0,1.0L10.0,2.0");
  });
});
