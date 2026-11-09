import { useMemo, useState } from "react";
import { useJson } from "../lib/data";
import { useFilters } from "../lib/state";
import { aggregateByMonth, filterCube } from "../lib/kpi";
import { formatInt, formatMonth, formatMonthShort, formatPct, formatRupees } from "../lib/format";
import type { AtRiskRow, AttritionFile, CohortFile, CubeRow, RiskRow, Summary } from "../lib/types";
import { SEGMENTS } from "../lib/types";
import { EmptyState, ErrorState, Footnote, PageHeader, Panel, Skeleton, Tag } from "../components/ui";
import { Donut, HBars, LineChart, Reveal } from "../components/charts";
import { IconDownload } from "../components/icons";

const PAGE = 10;
const SEG_COLORS: Record<string, string> = { All: "var(--accent)", "Mass Affluent": "var(--grey-1)", HNI: "var(--grey-2)", UHNI: "var(--accent-3)" };
const RISK_COLORS: Record<string, string> = { High: "var(--accent)", Medium: "var(--accent-2)", Low: "var(--grey-3)" };

function Heatmap({ data }: { data: CohortFile }) {
  const cohorts = [...new Set(data.cohorts.map((c) => c.cohort_month))].sort();
  const ks = Array.from({ length: 13 }, (_, i) => i);
  const cell = new Map(data.cohorts.map((c) => [`${c.cohort_month}|${c.months_since_onboarding}`, c]));
  return (
    <div className="max-h-[440px] overflow-auto" tabIndex={0} aria-label="Cohort retention heatmap, scrollable">
      <table className="min-w-[680px] text-center text-[11px]">
        <thead className="sticky top-0 bg-[var(--panel)]">
          <tr>
            <th>Cohort</th>
            <th className="text-right">Size</th>
            {ks.map((k) => (
              <th key={k} className="text-center">{`M${k}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const size = cell.get(`${c}|0`)?.cohort_size;
            return (
              <tr key={c}>
                <td className="text-left font-medium text-ink">{formatMonthShort(c)}</td>
                <td className="num text-right text-muted">{size ?? ""}</td>
                {ks.map((k) => {
                  const v = cell.get(`${c}|${k}`);
                  if (!v) return <td key={k} aria-label="not yet observable" />;
                  const a = Math.max(0.1, Math.min(1, (v.retention_pct - 78) / 22));
                  return (
                    <td
                      key={k}
                      className="num"
                      title={`${formatMonth(c)} cohort, month ${k}: ${v.retained_clients} of ${v.clients_observed} clients active`}
                      style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(a * 38)}%, transparent)`, color: "var(--ink)" }}
                    >
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
  const cube = useJson<CubeRow[]>("monthly_cube");
  const att = useJson<AttritionFile>("attrition_monthly");
  const coh = useJson<CohortFile>("cohort_retention");
  const risk = useJson<RiskRow[]>("risk_distribution");
  const top = useJson<AtRiskRow[]>("top_at_risk");
  const summary = useJson<Summary>("summary");
  const [page, setPage] = useState(0);

  const series = useMemo(() => {
    if (!cube.data || !ready) return { data: [] as Record<string, string | number | null>[], keys: [] as string[] };
    const keys = filters.segment === "All" ? ["All", ...SEGMENTS] : ["All"];
    const byKey = new Map<string, Map<string, number | null>>();
    for (const key of keys) {
      const seg = key === "All" ? filters.segment : key;
      const rows = filterCube(cube.data, { ...filters, segment: seg as typeof filters.segment });
      byKey.set(key, new Map(aggregateByMonth(rows).map((m) => [m.snapshot_date, m.attrition_rate])));
    }
    const months = [...new Set([...byKey.values()].flatMap((m) => [...m.keys()]))].sort();
    const data = months.map((d) => {
      const row: Record<string, string | number | null> = { x: d };
      for (const [k, m] of byKey) row[k] = m.get(d) ?? null;
      return row;
    });
    return { data, keys };
  }, [cube.data, filters, ready]);

  const gap = useMemo(() => {
    if (!att.data) return [];
    const seg = filters.segment === "All" ? "All" : filters.segment;
    return att.data.contact_gap.filter((g) => g.segment === seg).sort((a, b) => a.bucket_order - b.bucket_order);
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
    const lo = all.filter((g) => g.bucket_order === 1);
    const hi = all.filter((g) => g.bucket_order >= 3);
    const rate = (xs: typeof all) => {
      const o = xs.reduce((s, x) => s + x.opening_clients, 0);
      return o ? xs.reduce((s, x) => s + x.churned_clients, 0) / o : null;
    };
    const rl = rate(lo);
    const rh = rate(hi);
    if (rl === null || rh === null || rl === 0) return "Loading the contact-gap comparison.";
    return `Clients not reached for 90 days or more leave ${(rh / rl).toFixed(1)} times as often as those contacted in the last 30 days (${formatPct(rh)} against ${formatPct(rl)} a month).`;
  }, [att.data]);

  function downloadCsv() {
    const head = ["priority_rank", "client_id", "segment", "branch", "advisor_id", "aum_rupees", "days_since_last_contact", "risk_score", "risk_level", "reasons"];
    const lines = atRisk.map((r) => [r.priority_rank, r.client_id, r.segment, r.branch, r.advisor_id, r.aum, r.days_since_last_contact, r.risk_score, r.risk_level, `"${r.reasons ?? ""}"`].join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients_at_risk.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (cube.error) return <ErrorState message={cube.error} />;
  if (!cube.data || !ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  const t12 = summary.data?.attrition_trailing_12m;
  return (
    <div>
      <PageHeader title="Client health" takeaway={takeaway} />

      <Panel title="Monthly attrition" subtitle="Clients lost in the month as a share of clients active at the previous month-end">
        <LineChart
          label="Monthly attrition rate by segment"
          data={series.data}
          series={series.keys.map((k) => ({ key: k, name: k === "All" ? (filters.segment === "All" ? "All clients" : filters.segment) : k, color: SEG_COLORS[k] ?? "var(--grey-1)", width: k === "All" ? 2 : 1.5 }))}
          height={280}
          yFormat={(v) => formatPct(v, 1)}
          tipFormat={(v) => formatPct(v)}
          xLabel={formatMonthShort}
          xTitle={formatMonth}
          zeroBased
          right={110}
        />
        <p className="mt-4 text-[13px] text-muted">
          Trailing 12 months, all clients: <span className="num font-medium text-ink">{formatPct(t12)}</span> of the clients active a year ago have left
          {summary.data?.attrition_trailing_12m_as_of && <> (as of {formatMonth(summary.data.attrition_trailing_12m_as_of)})</>}.
        </p>
      </Panel>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title="Attrition by days since last contact" subtitle="Gap measured at the previous month-end, pooled over all months">
          {att.error ? (
            <ErrorState message={att.error} />
          ) : gap.length === 0 ? (
            <EmptyState />
          ) : (
            <HBars rows={gap.map((g) => ({ label: g.gap_bucket, value: g.attrition_rate, color: g.bucket_order >= 3 ? "var(--accent)" : "var(--grey-2)" }))} format={(v) => formatPct(v)} />
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Churn risk today" subtitle="Active clients by risk level">
          {risk.error ? (
            <ErrorState message={risk.error} />
          ) : riskRows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
              <Donut
                label="Active clients by churn risk level"
                slices={["High", "Medium", "Low"].map((l) => ({ name: l, value: riskRows.find((r) => r.risk_level === l)?.clients ?? 0, color: RISK_COLORS[l] ?? "var(--grey-3)" }))}
                centerValue={formatInt(riskTotal)}
                centerLabel="active clients"
              />
              <ul className="w-full space-y-2 text-sm">
                {["High", "Medium", "Low"].map((lvl) => {
                  const r = riskRows.find((x) => x.risk_level === lvl);
                  return (
                    <li key={lvl} className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-muted">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: RISK_COLORS[lvl] }} aria-hidden="true" />
                        {lvl}
                      </span>
                      <span className="num font-medium text-ink">
                        {formatInt(r?.clients ?? 0)} <span className="font-normal text-muted">{formatRupees(r?.aum ?? 0)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Cohort retention" subtitle="Share of each onboarding-month cohort still active, by months since joining">
        {coh.error ? (
          <ErrorState message={coh.error} />
        ) : !coh.data ? (
          <Skeleton className="h-64" />
        ) : (
          <Reveal height={440}>
            <Heatmap data={coh.data} />
          </Reveal>
        )}
      </Panel>

      <Panel
        className="mt-6"
        title="Clients to call first"
        subtitle={`${formatInt(atRisk.length)} High or Medium risk clients in the current filter, ranked by score then AUM. Client IDs only.`}
        action={
          <button type="button" onClick={downloadCsv} disabled={atRisk.length === 0} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-accent hover:bg-[var(--line)] disabled:opacity-40">
            <IconDownload />
            Download CSV
          </button>
        }
      >
        {top.error ? (
          <ErrorState message={top.error} />
        ) : atRisk.length === 0 ? (
          <EmptyState message="No at-risk clients for these filters." />
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto">
              <table>
                <caption className="sr-only">Clients ranked by churn risk</caption>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client</th>
                    <th>Segment</th>
                    <th>Branch</th>
                    <th className="text-right">AUM</th>
                    <th className="text-right">Days since contact</th>
                    <th>Risk</th>
                    <th>Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => (
                    <tr key={r.client_id}>
                      <td className="num text-muted">{r.priority_rank}</td>
                      <td className="num font-medium text-ink">{r.client_id}</td>
                      <td>{r.segment}</td>
                      <td>{r.branch}</td>
                      <td className="num text-right">{formatRupees(r.aum)}</td>
                      <td className="num text-right">{r.days_since_last_contact}</td>
                      <td>
                        <Tag tone={r.risk_level === "High" ? "accent" : "muted"}>{r.risk_level}</Tag>
                      </td>
                      <td className="text-muted">{(r.reasons ?? "").split(", ").filter(Boolean).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="Table pages" className="mt-4 flex items-center justify-between text-[13px] text-muted">
              <span>
                Page {cur + 1} of {pages}
              </span>
              <span className="flex gap-1">
                <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg px-3 py-1 hover:bg-[var(--line)] disabled:opacity-40">
                  Previous
                </button>
                <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg px-3 py-1 hover:bg-[var(--line)] disabled:opacity-40">
                  Next
                </button>
              </span>
            </nav>
          </>
        )}
      </Panel>

      <Footnote>
        A client is churned in a month if they were active at the previous month-end and then closed the account or fell below Rs 1 lakh. Segment is fixed at onboarding. The attrition
        lines follow the segment, branch and date filters; the contact-gap chart, cohort heatmap and risk donut follow the segment filter only. Risk is a transparent score: AUM down over
        50% in 3 months adds 3 (30 to 50% adds 1), no contact for 180 days or more adds 2 (90 days or more adds 1), idle cash above 30% adds 1. High is 3 or more, Medium 1 or 2, Low 0.
        Cohorts are clients who joined after the first month of data. All data is synthetic.
      </Footnote>
    </div>
  );
}
