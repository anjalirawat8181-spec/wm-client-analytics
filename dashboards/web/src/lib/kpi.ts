import type { CubeRow, Filters, MonthAgg } from "./types";

/** Keep cube rows that match the segment, branch and month range filters. */
export function filterCube(rows: CubeRow[], f: Filters): CubeRow[] {
  return rows.filter(
    (r) =>
      (f.segment === "All" || r.segment === f.segment) &&
      (f.branch === "All" || r.branch === f.branch) &&
      r.snapshot_date >= f.from &&
      r.snapshot_date <= f.to,
  );
}

/** Sum the cube by month and rebuild the ratio KPIs from the sums (never average rates). */
export function aggregateByMonth(rows: CubeRow[]): MonthAgg[] {
  const m = new Map<string, MonthAgg>();
  for (const r of rows) {
    let a = m.get(r.snapshot_date);
    if (!a) {
      a = {
        snapshot_date: r.snapshot_date, aum: 0, active_clients: 0, inflows: 0, outflows: 0, nnm: 0,
        opening_clients: 0, churned_clients: 0, new_clients: 0, fee_revenue: 0, revenue_lost: 0,
        attrition_rate: null, revenue_per_client: null,
      };
      m.set(r.snapshot_date, a);
    }
    a.aum += r.aum; a.active_clients += r.active_clients; a.inflows += r.inflows; a.outflows += r.outflows;
    a.nnm += r.nnm; a.opening_clients += r.opening_clients; a.churned_clients += r.churned_clients;
    a.new_clients += r.new_clients; a.fee_revenue += r.fee_revenue; a.revenue_lost += r.revenue_lost;
  }
  const out = [...m.values()].sort((x, y) => x.snapshot_date.localeCompare(y.snapshot_date));
  for (const a of out) {
    a.attrition_rate = a.opening_clients > 0 ? a.churned_clients / a.opening_clients : null;
    a.revenue_per_client = a.active_clients > 0 ? a.fee_revenue / a.active_clients : null;
  }
  return out;
}

export type Direction = "up" | "down" | "flat" | "none";
export interface Delta {
  abs: number | null;
  pct: number | null; // relative change as a fraction
  direction: Direction;
}

/** Change from prior to current. Relative change is null when the prior value is 0 or missing. */
export function computeDelta(current: number | null, prior: number | null): Delta {
  if (current === null || prior === null || Number.isNaN(current) || Number.isNaN(prior)) {
    return { abs: null, pct: null, direction: "none" };
  }
  const abs = current - prior;
  const pct = prior === 0 ? null : abs / Math.abs(prior);
  const direction: Direction = abs > 0 ? "up" : abs < 0 ? "down" : "flat";
  return { abs, pct, direction };
}

/** Good/bad/neutral for colouring a delta. For attrition, down is good. */
export function tone(direction: Direction, goodWhen: "up" | "down"): "good" | "bad" | "neutral" {
  if (direction === "flat" || direction === "none") return "neutral";
  return direction === goodWhen ? "good" : "bad";
}

/** Distinct sorted values of a field. */
export function uniqueSorted<T>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

/** Pooled ratio (sum of numerators over sum of denominators) over a set of months; null if the denominator is 0. */
export function pooledRate(rows: MonthAgg[], num: "churned_clients", den: "opening_clients"): number | null {
  const n = rows.reduce((s, r) => s + r[num], 0);
  const d = rows.reduce((s, r) => s + r[den], 0);
  return d > 0 ? n / d : null;
}
