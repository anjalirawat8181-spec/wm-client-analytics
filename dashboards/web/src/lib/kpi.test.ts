import { describe, expect, it } from "vitest";
import { aggregateByMonth, computeDelta, filterCube, pooledRate, tone } from "./kpi";
import type { CubeRow, Filters } from "./types";

const row = (over: Partial<CubeRow>): CubeRow => ({
  snapshot_date: "2026-01-31", segment: "HNI", branch: "Mumbai", aum: 100, active_clients: 10, inflows: 5, outflows: 2, nnm: 3,
  opening_clients: 10, churned_clients: 1, new_clients: 0, fee_revenue: 50, revenue_lost: 0, ...over,
});

const cube: CubeRow[] = [
  row({}),
  row({ segment: "UHNI", aum: 300, active_clients: 5, opening_clients: 5, churned_clients: 0, fee_revenue: 100 }),
  row({ branch: "Pune", aum: 50, active_clients: 4, opening_clients: 4, churned_clients: 2, fee_revenue: 10 }),
  row({ snapshot_date: "2026-02-28", aum: 120, active_clients: 10, opening_clients: 10, churned_clients: 0 }),
];
const all: Filters = { segment: "All", branch: "All", from: "2026-01-31", to: "2026-02-28" };

describe("computeDelta", () => {
  it("returns absolute and relative change with direction", () => {
    expect(computeDelta(110, 100)).toEqual({ abs: 10, pct: 0.1, direction: "up" });
    expect(computeDelta(90, 100)).toEqual({ abs: -10, pct: -0.1, direction: "down" });
    expect(computeDelta(100, 100)).toEqual({ abs: 0, pct: 0, direction: "flat" });
  });
  it("has no relative change when the prior value is 0", () => {
    expect(computeDelta(5, 0)).toEqual({ abs: 5, pct: null, direction: "up" });
  });
  it("is empty when either value is missing", () => {
    expect(computeDelta(null, 1).direction).toBe("none");
    expect(computeDelta(1, null).direction).toBe("none");
  });
  it("uses the absolute prior for negative bases", () => {
    expect(computeDelta(-50, -100).pct).toBe(0.5);
  });
});

describe("tone", () => {
  it("treats a fall in attrition as good", () => {
    expect(tone("down", "down")).toBe("good");
    expect(tone("up", "down")).toBe("bad");
    expect(tone("flat", "up")).toBe("neutral");
  });
});

describe("filterCube", () => {
  it("passes everything when filters are open", () => {
    expect(filterCube(cube, all)).toHaveLength(4);
  });
  it("filters by segment, branch and date range", () => {
    expect(filterCube(cube, { ...all, segment: "UHNI" })).toHaveLength(1);
    expect(filterCube(cube, { ...all, branch: "Pune" })).toHaveLength(1);
    expect(filterCube(cube, { ...all, from: "2026-02-28" })).toHaveLength(1);
    expect(filterCube(cube, { ...all, to: "2026-01-31" })).toHaveLength(3);
    expect(filterCube(cube, { ...all, segment: "HNI", branch: "Pune" })).toHaveLength(1);
  });
  it("returns nothing for an impossible combination", () => {
    expect(filterCube(cube, { ...all, segment: "UHNI", branch: "Pune" })).toHaveLength(0);
  });
});

describe("aggregateByMonth", () => {
  it("sums by month and rebuilds ratios from sums, not averages", () => {
    const m = aggregateByMonth(cube);
    expect(m).toHaveLength(2);
    const jan = m[0]!;
    expect(jan.aum).toBe(450);
    expect(jan.active_clients).toBe(19);
    expect(jan.opening_clients).toBe(19);
    expect(jan.churned_clients).toBe(3);
    expect(jan.attrition_rate).toBeCloseTo(3 / 19, 10);
    expect(jan.revenue_per_client).toBeCloseTo(160 / 19, 10);
  });
  it("gives null ratios when the denominator is 0", () => {
    const m = aggregateByMonth([row({ opening_clients: 0, churned_clients: 0, active_clients: 0 })]);
    expect(m[0]!.attrition_rate).toBeNull();
    expect(m[0]!.revenue_per_client).toBeNull();
  });
  it("sorts months ascending", () => {
    const m = aggregateByMonth([...cube].reverse());
    expect(m.map((x) => x.snapshot_date)).toEqual(["2026-01-31", "2026-02-28"]);
  });
});

describe("pooledRate", () => {
  it("pools churn over opening clients", () => {
    const m = aggregateByMonth(cube);
    expect(pooledRate(m, "churned_clients", "opening_clients")).toBeCloseTo(3 / 29, 10);
    expect(pooledRate([], "churned_clients", "opening_clients")).toBeNull();
  });
});
