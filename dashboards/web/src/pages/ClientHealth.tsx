import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { useJson } from "../lib/data";
import { useFilters, usePrefersReducedMotion } from "../lib/state";
import { aggregateByMonth, filterCube } from "../lib/kpi";
import { formatInt, formatMonth, formatMonthShort, formatPct, formatRupees } from "../lib/format";
import type { AtRiskRow, AttritionFile, CohortFile, CubeRow, RiskRow, Summary } from "../lib/types";
import { SEGMENTS } from "../lib/types";
import { Badge, Card, Chip, EmptyState, ErrorState, Footnote, PageHeader, Skeleton } from "../components/ui";
import { AXIS, ChartFrame, ChartTooltip, GRID, RISK_COLORS, SEGMENT_COLORS, ToggleLegend, useSeriesToggle } from "../components/chartkit";

const PAGE = 10;

function Heatmap({ data }: { data: CohortFile }) {
  const cohorts = [...new Set(data.cohorts.map((c) => c.cohort_month))].sort();
  const ks = Array.from({ length: 13 }, (_, i) => i);
  const cell = new Map(data.cohorts.map((c) => [`${c.cohort_month}|${c.months_since_onboarding}`, c]));
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-line" tabIndex={0} aria-label="Cohort retention heatmap, scrollable">
      <table className="min-w-[640px] text-center text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th className="text-left">Cohort</th><th>Size</th>
            {ks.map((k) => <th key={k} className="text-center">{k === 0 ? "M0" : `M${k}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const size = cell.get(`${c}|0`)?.cohort_size;
            return (
              <tr key={c}>
                <td className="whitespace-nowrap text-left font-medium text-ink">{formatMonthShort(c)}</td>
                <td className="num text-muted">{size ?? ""}</td>
                {ks.map((k) => {
                  const v = cell.get(`${c}|${k}`);
                  if (!v) return <td key={k} className="bg-surface2/40" aria-label="not yet observable" />;
                  const a = Math.max(0.12, (v.retention_pct - 80) / 20);
                  return (
                    <td key={k} className="num font-semibold" title={`${formatMonth(c)} cohort, month ${k}: ${v.retained_clients} of ${v.clients_observed} clients active`}
                      style={{ background: `color-mix(in srgb, var(--gold) ${Math.round(a * 45)}%, var(--surface2))`, color: "var(--text)" }}>
                      {v.retention_pct.toFixed(0)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientHealth() {
  const { filters, ready } = useFilters();
  const reduced = usePrefersReducedMotion();
  const cube = useJson<CubeRow[]>("monthly_cube");
  const att = useJson<AttritionFile>("attrition_monthly");
  const coh = useJson<CohortFile>("cohort_retention");
  const risk = useJson<RiskRow[]>("risk_distribution");
  const top = useJson<AtRiskRow[]>("top_at_risk");
  const summary = useJson<Summary>("summary");
  const [page, setPage] = useState(0);
  const segKeys = ["All", ...SEGMENTS];
  const lineToggle = useSeriesToggle(segKeys);

  const series = useMemo(() => {
    if (!cube.data || !ready) return [];
    const byKey = new Map<string, Map<string, number | null>>();
    for (const key of segKeys) {
      const seg = key === "All" ? filters.segment : key;
      if (key !== "All" && filters.segment !== "All" && key !== filters.segment) continue;
      const rows = filterCube(cube.data, { ...filters, segment: seg as typeof filters.segment });
      byKey.set(key, new Map(aggregateByMonth(rows).map((m) => [m.snapshot_date, m.attrition_rate])));
    }
    const months = [...new Set([...byKey.values()].flatMap((m) => [...m.keys()]))].sort();
    return months.map((d) => {
      const row: Record<string, string | number | null> = { snapshot_date: d };
      for (const [k, m] of byKey) row[k] = m.get(d) ?? null;
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube.data, filters, ready]);

  const gap = useMemo(() => {
    if (!att.data) return [];
    return att.data.contact_gap.filter((g) => g.segment === (filters.segment === "All" ? "All" : filters.segment)).sort((a, b) => a.bucket_order - b.bucket_order);
  }, [att.data, filters.segment]);

  const riskRows = useMemo(() => (risk.data ?? []).filter((r) => r.segment === filters.segment), [risk.data, filters.segment]);
  const riskTotal = riskRows.reduce((s, r) => s + r.clients, 0);

  const atRisk = useMemo(
    () => (top.data ?? []).filter((r) => (filters.segment === "All" || r.segment === filters.segment) && (filters.branch === "All" || r.branch === filters.branch)),
    [top.data, filters.segment, filters.branch],
  );
  const pages = Math.max(1, Math.ceil(atRisk.length / PAGE));
  const cur = Math.min(page, pages - 1);

  const takeaway = useMemo(() => {
    const all = (att.data?.contact_gap ?? []).filter((g) => g.segment === "All");
    const lo = all.filter((g) => g.bucket_order === 1), hi = all.filter((g) => g.bucket_order >= 3);
    const rate = (xs: typeof all) => { const o = xs.reduce((s, x) => s + x.opening_clients, 0); return o ? xs.reduce((s, x) => s + x.churned_clients, 0) / o : null; };
    const rl = rate(lo), rh = rate(hi);
    if (rl === null || rh === null || rl === 0) return "Loading the contact-gap comparison.";
    return `Clients not reached for 90 days or more leave ${(rh / rl).toFixed(1)} times as often as those contacted in the last 30 days (${formatPct(rh)} against ${formatPct(rl)} a month).`;
  }, [att.data]);

  function downloadCsv() {
    const head = ["priority_rank", "client_id", "segment", "branch", "advisor_id", "aum_rupees", "days_since_last_contact", "risk_score", "risk_level", "reasons"];
    const lines = atRisk.map((r) => [r.priority_rank, r.client_id, r.segment, r.branch, r.advisor_id, r.aum, r.days_since_last_contact, r.risk_score, r.risk_level, `"${r.reasons ?? ""}"`].join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "clients_at_risk.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (cube.error) return <ErrorState message={cube.error} />;
  if (!cube.data || !ready) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>;

  const t12 = summary.data?.attrition_trailing_12m;
  return (
    <div>
      <PageHeader title="Client health" takeaway={takeaway} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Monthly attrition by segment" subtitle="Clients lost in the month as a share of clients active at the previous month-end">
          <ToggleLegend isOn={lineToggle.isOn} toggle={lineToggle.toggle}
            items={segKeys.filter((k) => k === "All" || filters.segment === "All" || k === filters.segment).map((k) => ({ key: k, label: k === "All" ? (filters.segment === "All" ? "All clients" : "Selected") : k, color: SEGMENT_COLORS[k] ?? "var(--text)" }))} />
          <ChartFrame label="Monthly attrition rate by segment" height={280}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="snapshot_date" tickFormatter={formatMonthShort} {...AXIS} minTickGap={24} />
                <YAxis tickFormatter={(v: number) => formatPct(v, 1)} width={48} {...AXIS} />
                <Tooltip content={<ChartTooltip format={(v) => formatPct(v)} labelFormat={formatMonth} />} />
                {Object.keys(series[0] ?? {}).filter((k) => k !== "snapshot_date" && lineToggle.isOn(k)).map((k) => (
                  <Line key={k} type="monotone" dataKey={k} name={k === "All" ? "All clients" : k} stroke={SEGMENT_COLORS[k]} strokeWidth={k === "All" ? 3 : 2}
                    strokeDasharray={k === "All" ? undefined : "0"} dot={false} connectNulls isAnimationActive={!reduced} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          <p className="mt-2 text-xs text-muted">
            Trailing 12-month attrition (clients churned in the last 12 months / clients active 12 months ago):{" "}
            <span className="num font-semibold text-ink">{formatPct(t12)}</span>
            {summary.data?.attrition_trailing_12m_as_of && <> as of {formatMonth(summary.data.attrition_trailing_12m_as_of)}</>} (all clients).
          </p>
        </Card>

        <Card title="Churn risk today" subtitle="Active clients by risk level, latest month-end">
          {risk.error ? <ErrorState message={risk.error} /> : riskRows.length === 0 ? <EmptyState /> : (
            <>
              <div className="relative">
                <ChartFrame label="Active clients by churn risk level" height={210}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Tooltip content={<ChartTooltip format={(v) => `${formatInt(v)} clients`} />} />
                      <Pie data={riskRows} dataKey="clients" nameKey="risk_level" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--surface)" isAnimationActive={!reduced}>
                        {riskRows.map((r) => <Cell key={r.risk_level} fill={RISK_COLORS[r.risk_level]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartFrame>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="num text-2xl font-bold text-ink">{formatInt(riskTotal)}</span>
                  <span className="text-[11px] text-muted">active clients</span>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {["High", "Medium", "Low"].map((lvl) => {
                  const r = riskRows.find((x) => x.risk_level === lvl);
                  return (
                    <li key={lvl} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RISK_COLORS[lvl] }} aria-hidden="true" />{lvl}</span>
                      <span className="num font-semibold text-ink">{formatInt(r?.clients ?? 0)} <span className="font-normal text-muted">({formatRupees(r?.aum ?? 0)})</span></span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Attrition by days since last contact" subtitle="Contact gap measured at the previous month-end, pooled over all months">
          {att.error ? <ErrorState message={att.error} /> : gap.length === 0 ? <EmptyState /> : (
            <ChartFrame label="Monthly attrition rate by contact gap bucket" height={240}>
              <ResponsiveContainer>
                <BarChart data={gap} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="gap_bucket" {...AXIS} />
                  <YAxis tickFormatter={(v: number) => formatPct(v, 1)} width={48} {...AXIS} />
                  <Tooltip content={<ChartTooltip format={(v) => formatPct(v)} />} cursor={{ fill: "var(--surface2)" }} />
                  <Bar dataKey="attrition_rate" name="Monthly attrition" radius={[6, 6, 0, 0]} isAnimationActive={!reduced}>
                    {gap.map((g) => <Cell key={g.gap_bucket} fill={g.bucket_order >= 3 ? "var(--negative)" : "var(--c1)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Card>

        <Card title="Cohort retention" subtitle="Share of each onboarding-month cohort still active, by months since joining">
          {coh.error ? <ErrorState message={coh.error} /> : !coh.data ? <Skeleton className="h-64" /> : <Heatmap data={coh.data} />}
        </Card>
      </div>

      <Card className="mt-4" title="Clients to call first" subtitle={`${formatInt(atRisk.length)} High and Medium risk clients in the current filter (top ${top.data?.length ?? 0} overall by score then AUM); client IDs only`}
        action={<button type="button" onClick={downloadCsv} disabled={atRisk.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-xs font-medium text-ink hover:border-gold disabled:opacity-50">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />Download CSV</button>}>
        {top.error ? <ErrorState message={top.error} /> : atRisk.length === 0 ? <EmptyState message="No at-risk clients for these filters." /> : (
          <>
            <div className="overflow-x-auto">
              <table>
                <caption className="sr-only">Clients ranked by churn risk</caption>
                <thead><tr><th>#</th><th>Client</th><th>Segment</th><th>Branch</th><th className="text-right">AUM</th><th className="text-right">Days since contact</th><th>Risk</th><th>Why</th></tr></thead>
                <tbody>
                  {atRisk.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => (
                    <tr key={r.client_id}>
                      <td className="num text-muted">{r.priority_rank}</td>
                      <td className="num font-medium text-ink">{r.client_id}</td>
                      <td>{r.segment}</td><td>{r.branch}</td>
                      <td className="num text-right">{formatRupees(r.aum)}</td>
                      <td className="num text-right">{r.days_since_last_contact}</td>
                      <td><Badge tone={r.risk_level === "High" ? "neg" : "gold"}>{r.risk_level}</Badge></td>
                      <td>{(r.reasons ?? "").split(", ").filter(Boolean).map((x) => <Chip key={x}>{x}</Chip>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Table pages" className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>Page {cur + 1} of {pages}</span>
              <span className="flex gap-2">
                <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg border border-line px-3 py-1 hover:border-gold disabled:opacity-40">Previous</button>
                <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg border border-line px-3 py-1 hover:border-gold disabled:opacity-40">Next</button>
              </span>
            </nav>
          </>
        )}
      </Card>

      <Footnote>
        A client is churned in a month if they were active at the previous month-end and then closed the account or fell below Rs 1 lakh. Segment is fixed at onboarding.
        The attrition lines follow the segment, branch and date filters; the contact-gap chart, cohort heatmap and risk donut follow the segment filter only (branch is not
        available at that grain). Risk level is a transparent score: AUM down over 50% in 3 months +3 (30-50% +1), no contact for 180+ days +2 (90+ days +1), idle cash
        above 30% +1; High is 3 or more points, Medium 1-2, Low 0. Cohorts are clients who joined inside the data window. All data is synthetic.
      </Footnote>
    </div>
  );
}
