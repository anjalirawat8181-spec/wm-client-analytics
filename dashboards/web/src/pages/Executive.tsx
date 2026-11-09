import { useMemo } from "react";
import { useJson } from "../lib/data";
import { useFilters } from "../lib/state";
import { aggregateByMonth, filterCube } from "../lib/kpi";
import { formatInt, formatMonth, formatMonthShort, formatPct, formatRupees, formatRupeesShort } from "../lib/format";
import type { AllocationRow, CubeRow, MonthAgg } from "../lib/types";
import { Delta, EmptyState, ErrorState, Footnote, PageHeader, Panel, Skeleton, Stat } from "../components/ui";
import { BarsChart, HBars, LineChart, Reveal, StackedArea } from "../components/charts";

const ASSET_KEYS = ["Equity", "Debt", "Hybrid", "Gold", "Alternatives", "Cash"];
const ASSET_COLORS = ["var(--accent)", "var(--accent-2)", "var(--accent-3)", "var(--grey-1)", "var(--grey-2)", "var(--grey-3)"];

function Insight({ rows }: { rows: MonthAgg[] }) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return <>No months selected.</>;
  const positive = rows.filter((r) => r.nnm > 0).length;
  const churned = rows.reduce((s, r) => s + r.churned_clients, 0);
  const opening = rows.reduce((s, r) => s + r.opening_clients, 0);
  const change = first.aum > 0 && rows.length > 1 ? last.aum / first.aum - 1 : null;
  return (
    <>
      AUM is {formatRupees(last.aum)} at {formatMonth(last.snapshot_date)}
      {change !== null && (
        <>
          , {change >= 0 ? "up" : "down"} {formatPct(Math.abs(change), 1)} since {formatMonth(first.snapshot_date)}
        </>
      )}
      . Net new money was positive in {positive} of {rows.length} months
      {opening > 0 && (
        <>
          , and {formatInt(churned)} of the {formatInt(opening)} client-months at risk ended in a lost client ({formatPct(churned / opening)} a month on average)
        </>
      )}
      .
    </>
  );
}

export default function Executive() {
  const { filters, ready } = useFilters();
  const cube = useJson<CubeRow[]>("monthly_cube");
  const alloc = useJson<AllocationRow[]>("allocation_mix");

  const view = useMemo(() => {
    if (!cube.data || !ready) return null;
    const scoped = filterCube(cube.data, { ...filters, from: "0000", to: "9999" });
    const everyMonth = aggregateByMonth(scoped);
    const inRange = everyMonth.filter((m) => m.snapshot_date >= filters.from && m.snapshot_date <= filters.to);
    const last = inRange[inRange.length - 1];
    const idx = last ? everyMonth.findIndex((m) => m.snapshot_date === last.snapshot_date) : -1;
    const prior = idx > 0 ? everyMonth[idx - 1] : undefined;
    const spark = everyMonth.slice(Math.max(0, idx - 11), idx + 1);
    const lastRows = last ? filterCube(cube.data, { ...filters, from: last.snapshot_date, to: last.snapshot_date }) : [];
    const bySeg = new Map<string, number>();
    const byBranch = new Map<string, number>();
    for (const r of lastRows) {
      bySeg.set(r.segment, (bySeg.get(r.segment) ?? 0) + r.aum);
      byBranch.set(r.branch, (byBranch.get(r.branch) ?? 0) + r.aum);
    }
    const total = [...bySeg.values()].reduce((a, b) => a + b, 0) || 1;
    return {
      inRange,
      last,
      prior,
      spark,
      segments: [...bySeg].map(([name, value]) => ({ name, value, share: value / total })).sort((a, b) => b.value - a.value),
      branches: [...byBranch].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  }, [cube.data, filters, ready]);

  const allocation = useMemo(() => {
    if (!alloc.data || !ready) return [];
    const byMonth = new Map<string, Record<string, number | string>>();
    for (const r of alloc.data) {
      if (r.segment !== filters.segment || r.snapshot_date < filters.from || r.snapshot_date > filters.to) continue;
      const row = byMonth.get(r.snapshot_date) ?? { x: r.snapshot_date };
      row[r.asset_class] = r.share_pct;
      byMonth.set(r.snapshot_date, row);
    }
    return [...byMonth.values()].sort((a, b) => String(a.x).localeCompare(String(b.x)));
  }, [alloc.data, filters, ready]);

  if (cube.error) return <ErrorState message={cube.error} />;
  if (!view || !view.last) {
    return cube.loading || !ready ? (
      <div className="space-y-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-[420px]" />
      </div>
    ) : (
      <EmptyState />
    );
  }
  const { last, prior, spark, inRange } = view;
  const col = (k: keyof MonthAgg) => spark.map((m) => m[k] as number | null);
  const trend = inRange.map((m) => ({ x: m.snapshot_date, aum: m.aum }));
  const flows = inRange.map((m) => ({ x: m.snapshot_date, v: m.nnm }));

  return (
    <div>
      <PageHeader title="Executive overview" takeaway={<Insight rows={inRange} />} />

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <div>
            <p className="text-[13px] text-muted">Assets under management, {formatMonth(last.snapshot_date)}</p>
            <p className="display mt-1 text-[40px] leading-none text-ink sm:text-[56px]" data-testid="kpi-tile">
              {formatRupees(last.aum)}
            </p>
          </div>
          <Delta current={last.aum} prior={prior?.aum ?? null} />
        </div>
        <div className="mt-8">
          <LineChart
            label={`AUM by month, ${formatMonth(inRange[0]!.snapshot_date)} to ${formatMonth(last.snapshot_date)}`}
            data={trend}
            series={[{ key: "aum", name: "AUM", color: "var(--accent)", width: 2 }]}
            height={240}
            yFormat={formatRupeesShort}
            tipFormat={(v) => formatRupees(v)}
            xLabel={formatMonthShort}
            xTitle={formatMonth}
          />
          <BarsChart
            label="Net new money by month"
            data={flows}
            name="Net new money"
            height={100}
            yFormat={formatRupeesShort}
            tipFormat={(v) => formatRupees(v)}
            xLabel={formatMonthShort}
            xTitle={formatMonth}
          />
        </div>
      </Panel>

      <div className="panel mt-6 grid grid-cols-2 gap-y-6 divide-line p-5 sm:p-7 lg:grid-cols-4 lg:divide-x">
        <div className="lg:pr-6">
          <Stat label="Net new money" value={formatRupees(last.nnm)} current={last.nnm} prior={prior?.nnm ?? null} series={col("nnm")} hint="in the month" />
        </div>
        <div className="lg:px-6">
          <Stat label="Fee revenue" value={formatRupees(last.fee_revenue)} current={last.fee_revenue} prior={prior?.fee_revenue ?? null} series={col("fee_revenue")} hint="in the month" />
        </div>
        <div className="lg:px-6">
          <Stat label="Active clients" value={formatInt(last.active_clients)} current={last.active_clients} prior={prior?.active_clients ?? null} series={col("active_clients")} />
        </div>
        <div className="lg:pl-6">
          <Stat label="Monthly attrition" value={formatPct(last.attrition_rate)} current={last.attrition_rate} prior={prior?.attrition_rate ?? null} goodWhen="down" mode="points" series={col("attrition_rate")} hint="of opening clients" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Where the assets sit" subtitle={`Share of AUM at ${formatMonth(last.snapshot_date)}`}>
          <p className="mb-3 text-xs text-muted">By segment</p>
          <HBars rows={view.segments.map((s) => ({ label: s.name, value: s.share }))} format={(v) => formatPct(v, 1)} max={1} />
          <p className="mb-3 mt-8 text-xs text-muted">By branch</p>
          <HBars rows={view.branches.map((b) => ({ label: b.name, value: b.value, color: "var(--accent-2)" }))} format={formatRupeesShort} />
        </Panel>

        <Panel title="Asset allocation" subtitle={`Share of ${filters.segment === "All" ? "total" : filters.segment} AUM by asset class`}>
          {alloc.error ? (
            <ErrorState message={alloc.error} />
          ) : allocation.length === 0 ? (
            <EmptyState />
          ) : (
            <Reveal height={260}>
              <StackedArea
                label="Asset allocation share by month"
                data={allocation}
                keys={ASSET_KEYS}
                colors={ASSET_COLORS}
                height={260}
                tipFormat={(v) => `${v.toFixed(1)}%`}
                xLabel={formatMonthShort}
                xTitle={formatMonth}
              />
            </Reveal>
          )}
        </Panel>
      </div>

      <Footnote>
        AUM is the sum of market value across all products, cash included, at month-end; closed clients count as 0 from the closure month-end. Net new money is external inflows minus
        external outflows in the month, with switches between products excluded. Fee revenue is booked in the month for clients active at month-end. A client is active when the
        account is open and AUM is at least Rs 1 lakh. Attrition is the share of clients active last month-end who closed or fell below Rs 1 lakh. Changes compare with the prior
        month; for attrition they are percentage points. Allocation follows the segment filter only. All data is synthetic.
      </Footnote>
    </div>
  );
}
