import { useMemo } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { useJson } from "../lib/data";
import { useFilters, usePrefersReducedMotion } from "../lib/state";
import { aggregateByMonth, filterCube } from "../lib/kpi";
import { formatInt, formatMonth, formatMonthShort, formatPct, formatRupees, formatRupeesShort } from "../lib/format";
import type { AllocationRow, CubeRow, MonthAgg } from "../lib/types";
import { Card, EmptyState, ErrorState, Footnote, KpiTile, PageHeader, Skeleton } from "../components/ui";
import { ASSET_COLORS, AXIS, ChartFrame, ChartTooltip, GRID, SEGMENT_COLORS, ToggleLegend, useSeriesToggle } from "../components/chartkit";

function Insight({ rows }: { rows: MonthAgg[] }) {
  const first = rows[0], last = rows[rows.length - 1];
  if (!first || !last) return <>No months selected.</>;
  const positive = rows.filter((r) => r.nnm > 0).length;
  const churned = rows.reduce((s, r) => s + r.churned_clients, 0);
  const opening = rows.reduce((s, r) => s + r.opening_clients, 0);
  const change = first.aum > 0 && rows.length > 1 ? last.aum / first.aum - 1 : null;
  return (
    <>
      AUM is {formatRupees(last.aum)} at {formatMonth(last.snapshot_date)}
      {change !== null && <>, {change >= 0 ? "up" : "down"} {formatPct(Math.abs(change), 1)} since {formatMonth(first.snapshot_date)}</>}.
      {" "}Net new money was positive in {positive} of {rows.length} months
      {opening > 0 && <>, and {formatInt(churned)} of the {formatInt(opening)} client-months at risk ended in a lost client ({formatPct(churned / opening)} a month on average)</>}.
    </>
  );
}

export default function Executive() {
  const { filters, ready } = useFilters();
  const reduced = usePrefersReducedMotion();
  const cube = useJson<CubeRow[]>("monthly_cube");
  const alloc = useJson<AllocationRow[]>("allocation_mix");
  const trendToggle = useSeriesToggle(["aum", "nnm"]);

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
    const bySeg = new Map<string, number>(), byBranch = new Map<string, number>();
    for (const r of lastRows) {
      bySeg.set(r.segment, (bySeg.get(r.segment) ?? 0) + r.aum);
      byBranch.set(r.branch, (byBranch.get(r.branch) ?? 0) + r.aum);
    }
    return {
      inRange, last, prior, spark,
      segments: [...bySeg].map(([name, value]) => ({ name, value })),
      branches: [...byBranch].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  }, [cube.data, filters, ready]);

  const allocation = useMemo(() => {
    if (!alloc.data || !ready) return [];
    const seg = filters.segment;
    const byMonth = new Map<string, Record<string, number | string>>();
    for (const r of alloc.data) {
      if (r.segment !== seg || r.snapshot_date < filters.from || r.snapshot_date > filters.to) continue;
      const row = byMonth.get(r.snapshot_date) ?? { snapshot_date: r.snapshot_date };
      row[r.asset_class] = r.share_pct;
      byMonth.set(r.snapshot_date, row);
    }
    return [...byMonth.values()].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
  }, [alloc.data, filters, ready]);

  if (cube.error) return <ErrorState message={cube.error} />;
  if (!view || !view.last) {
    return cube.loading || !ready ? (
      <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-28" /><Skeleton className="h-72" /></div>
    ) : <EmptyState />;
  }
  const { last, prior, spark, inRange } = view;
  const col = (k: keyof MonthAgg) => spark.map((m) => m[k] as number | null);
  const trendData = inRange.map((m) => ({ ...m, aumPos: m.aum }));
  const assetKeys = ["Equity", "Debt", "Hybrid", "Gold", "Alternatives", "Cash"];

  return (
    <div>
      <PageHeader title="Executive overview" takeaway={<Insight rows={inRange} />} />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Assets under management" value={formatRupees(last.aum)} current={last.aum} prior={prior?.aum ?? null} series={col("aum")} />
        <KpiTile label="Net new money" value={formatRupees(last.nnm)} current={last.nnm} prior={prior?.nnm ?? null} series={col("nnm")} hint="in the month" />
        <KpiTile label="Fee revenue" value={formatRupees(last.fee_revenue)} current={last.fee_revenue} prior={prior?.fee_revenue ?? null} series={col("fee_revenue")} hint="in the month" />
        <KpiTile label="Active clients" value={formatInt(last.active_clients)} current={last.active_clients} prior={prior?.active_clients ?? null} series={col("active_clients")} />
        <KpiTile label="Monthly attrition" value={formatPct(last.attrition_rate)} current={last.attrition_rate} prior={prior?.attrition_rate ?? null}
          goodWhen="down" mode="points" series={col("attrition_rate")} hint="lost / opening clients" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="AUM and net new money" subtitle="AUM (area, left axis) and monthly net new money (bars, right axis)">
          <ToggleLegend isOn={trendToggle.isOn} toggle={trendToggle.toggle}
            items={[{ key: "aum", label: "AUM", color: "var(--gold)" }, { key: "nnm", label: "Net new money", color: "var(--positive)" }]} />
          <ChartFrame label={`AUM and net new money by month, ${formatMonth(inRange[0]!.snapshot_date)} to ${formatMonth(last.snapshot_date)}`} height={300}>
            <ResponsiveContainer>
              <ComposedChart data={trendData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--gold)", stopOpacity: 0.45 }} />
                    <stop offset="100%" style={{ stopColor: "var(--gold)", stopOpacity: 0.02 }} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="snapshot_date" tickFormatter={formatMonthShort} {...AXIS} minTickGap={24} />
                <YAxis yAxisId="aum" tickFormatter={formatRupeesShort} width={84} {...AXIS} domain={["dataMin", "auto"]} />
                <YAxis yAxisId="nnm" orientation="right" tickFormatter={formatRupeesShort} width={72} {...AXIS} />
                <Tooltip content={<ChartTooltip format={(v) => formatRupees(v)} labelFormat={formatMonth} />} />
                {trendToggle.isOn("aum") && <Area yAxisId="aum" type="monotone" dataKey="aum" name="AUM" stroke="var(--gold)" strokeWidth={2.5} fill="url(#aumFill)" isAnimationActive={!reduced} />}
                {trendToggle.isOn("nnm") && (
                  <Bar yAxisId="nnm" dataKey="nnm" name="Net new money" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} maxBarSize={18}>
                    {trendData.map((d) => <Cell key={d.snapshot_date} fill={d.nnm >= 0 ? "var(--positive)" : "var(--negative)"} fillOpacity={0.85} />)}
                  </Bar>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title="AUM by segment" subtitle={`At ${formatMonth(last.snapshot_date)}`}>
          <ChartFrame label="AUM share by segment" height={220}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip content={<ChartTooltip format={(v) => formatRupees(v)} />} />
                <Pie data={view.segments} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="var(--surface)" isAnimationActive={!reduced}>
                  {view.segments.map((s) => <Cell key={s.name} fill={SEGMENT_COLORS[s.name] ?? "var(--c6)"} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
          <ul className="mt-2 space-y-1 text-xs">
            {view.segments.map((s) => {
              const total = view.segments.reduce((a, b) => a + b.value, 0);
              return (
                <li key={s.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SEGMENT_COLORS[s.name] }} aria-hidden="true" />{s.name}</span>
                  <span className="num font-semibold text-ink">{formatPct(s.value / total, 1)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="AUM by branch" subtitle={`At ${formatMonth(last.snapshot_date)}`}>
          <ChartFrame label="AUM by branch" height={240}>
            <ResponsiveContainer>
              <BarChart data={view.branches} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...GRID} horizontal={false} vertical />
                <XAxis type="number" tickFormatter={formatRupeesShort} {...AXIS} />
                <YAxis type="category" dataKey="name" width={84} {...AXIS} />
                <Tooltip content={<ChartTooltip format={(v) => formatRupees(v)} />} cursor={{ fill: "var(--surface2)" }} />
                <Bar dataKey="value" name="AUM" fill="var(--c1)" radius={[0, 6, 6, 0]} isAnimationActive={!reduced} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title="Asset allocation mix" subtitle={`Share of ${filters.segment === "All" ? "total" : filters.segment} AUM by asset class`}>
          {alloc.error ? <ErrorState message={alloc.error} /> : allocation.length === 0 ? <EmptyState /> : (
            <ChartFrame label="Asset allocation share by month" height={240}>
              <ResponsiveContainer>
                <ComposedChart data={allocation} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="snapshot_date" tickFormatter={formatMonthShort} {...AXIS} minTickGap={24} />
                  <YAxis tickFormatter={(v: number) => `${Math.round(v)}%`} width={48} {...AXIS} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} labelFormat={formatMonth} />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {assetKeys.map((k) => (
                    <Area key={k} type="monotone" dataKey={k} stackId="a" name={k} stroke={ASSET_COLORS[k]} fill={ASSET_COLORS[k]} fillOpacity={0.75} isAnimationActive={!reduced} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Card>
      </div>

      <Footnote>
        AUM = sum of market value across all products including cash at month-end (closed clients count as 0 from the closure month-end). Net new money = external
        inflows minus external outflows in the month; switches between products are excluded. Fee revenue is booked in the month for clients active at month-end.
        Active = account open and AUM of at least Rs 1 lakh. Attrition = clients active last month-end who closed or fell below Rs 1 lakh, divided by clients active
        last month-end. Deltas compare with the prior month; for attrition they are percentage points. Allocation follows the segment filter only. All data is synthetic.
      </Footnote>
    </div>
  );
}
