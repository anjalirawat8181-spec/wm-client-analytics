import { useMemo } from "react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { useJson } from "../lib/data";
import { formatInt } from "../lib/format";
import type { DqFile } from "../lib/types";
import { Badge, Card, ErrorState, Footnote, PageHeader, Skeleton } from "../components/ui";

function Gauge({ pct, label }: { pct: number; label: string }) {
  const r = 70, c = Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${(pct * 100).toFixed(1)} percent`}>
      <svg width="180" height="108" viewBox="0 0 180 108" role="img" aria-hidden="true">
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--positive)" strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <text x="90" y="82" textAnchor="middle" className="num" style={{ fill: "var(--text)", fontSize: 28, fontWeight: 700 }}>{(pct * 100).toFixed(1)}%</text>
      </svg>
      <figcaption className="-mt-2 text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

export default function DataQuality() {
  const { data, error } = useJson<DqFile>("dq_scorecard");
  const stats = useMemo(() => {
    if (!data) return null;
    const planted = data.detection.reduce((s, d) => s + d.planted, 0);
    const caught = data.detection.reduce((s, d) => s + d.caught, 0);
    const fp = data.detection.reduce((s, d) => s + d.false_positives, 0);
    const missed = data.detection.reduce((s, d) => s + d.missed, 0);
    const o = data.overall;
    const unaccounted = data.reconciliation.reduce((s, r) => s + Math.abs(r.unaccounted), 0);
    const staging = data.reconciliation.reduce((s, r) => s + r.staging, 0);
    const rejected = data.reconciliation.reduce((s, r) => s + r.rejected_or_duplicate, 0);
    return { planted, caught, fp, missed, o, unaccounted, staging, rejected, trusted: planted > 0 && missed === 0 && fp === 0 && unaccounted === 0 && (o?.strict_failures ?? 1) === 0 };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data || !stats) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;

  const strictRules = data.scorecard.filter((r) => r.strict);
  const strictPass = strictRules.filter((r) => r.failures === 0).length;
  const rulesPct = strictRules.length ? strictPass / strictRules.length : 0;
  const take = stats.planted > 0
    ? `The pipeline caught ${formatInt(stats.caught)} of ${formatInt(stats.planted)} planted defects with ${stats.fp} false positives, and every one of ${formatInt(stats.staging)} staged rows is either loaded or logged (${formatInt(stats.rejected)} logged and kept out of the KPIs).`
    : "Planted-defect results are not available in this build.";

  return (
    <div>
      <PageHeader title="Data quality" takeaway={take} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Rules passing"><div className="flex justify-center"><Gauge pct={rulesPct} label={`${strictPass} of ${strictRules.length} rules (plus ${data.scorecard.length - strictRules.length} informational)`} /></div></Card>
        <Card title="Trust badge" className="flex flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            {stats.trusted ? <BadgeCheck className="h-12 w-12 text-pos" aria-hidden="true" /> : <TriangleAlert className="h-12 w-12 text-neg" aria-hidden="true" />}
            <p className="text-lg font-bold text-ink">{stats.trusted ? "KPIs run on verified data" : "Review needed"}</p>
            <p className="text-xs text-muted">{stats.trusted ? "All planted defects caught, none missed, no false positives, no unaccounted rows." : "At least one check did not pass; see the tables below."}</p>
          </div>
        </Card>
        <Card title="Where the rows went">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Staged rows</dt><dd className="num font-semibold text-ink">{formatInt(stats.staging)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Loaded to mart</dt><dd className="num font-semibold text-ink">{formatInt(stats.staging - stats.rejected)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Rejected or duplicate</dt><dd className="num font-semibold text-ink">{formatInt(stats.rejected)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Unaccounted</dt><dd className="num font-semibold text-ink">{formatInt(stats.unaccounted)}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Planted versus caught" subtitle="The generator recorded every dirty record it injected; the pipeline is scored against that answer key">
          {data.detection.length === 0 ? <p className="text-sm text-muted">Not available in this build.</p> : (
            <div className="overflow-x-auto">
              <table>
                <caption className="sr-only">Planted defects versus defects caught</caption>
                <thead><tr><th>Table</th><th>Defect</th><th className="text-right">Planted</th><th className="text-right">Caught</th><th className="text-right">Missed</th><th className="text-right">False +</th></tr></thead>
                <tbody>
                  {data.detection.map((d) => (
                    <tr key={`${d.table}${d.defect}`}>
                      <td>{d.table}</td><td>{d.defect.replace(/_/g, " ")}</td>
                      <td className="num text-right">{formatInt(d.planted)}</td><td className="num text-right">{formatInt(d.caught)}</td>
                      <td className="num text-right">{d.missed}</td><td className="num text-right">{d.false_positives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.detection_note && <p className="mt-2 text-xs text-muted">{data.detection_note}</p>}
        </Card>

        <Card title="What happened to the dirty rows" subtitle="Everything rejected or fixed is kept in an exceptions table with its raw record">
          <div className="overflow-x-auto">
            <table>
              <caption className="sr-only">Exceptions by table and rule</caption>
              <thead><tr><th>Table</th><th>Rule</th><th>Handling</th><th className="text-right">Rows</th></tr></thead>
              <tbody>
                {data.exceptions.map((e) => (
                  <tr key={`${e.source_table}${e.rule_name}`}>
                    <td>{e.source_table}</td><td>{e.rule_name.replace(/_/g, " ")}</td>
                    <td><Badge tone={e.handling.startsWith("rem") ? "gold" : "muted"}>{e.handling.startsWith("rem") ? "remediated" : "rejected"}</Badge></td>
                    <td className="num text-right">{formatInt(e.rows_affected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="All rules" subtitle={data.generated_at ? `Last run ${data.generated_at.slice(0, 10)}` : undefined}>
        <div className="max-h-[420px] overflow-auto">
          <table>
            <caption className="sr-only">All data quality rules</caption>
            <thead className="sticky top-0 bg-surface"><tr><th>Rule</th><th>Category</th><th className="text-right">Checked</th><th className="text-right">Failures</th><th className="text-right">Pass</th></tr></thead>
            <tbody>
              {data.scorecard.map((r) => (
                <tr key={r.rule}>
                  <td className="font-medium text-ink">{r.rule.replace(/_/g, " ")}{!r.strict && <span className="ml-1 text-[11px] text-muted">(informational)</span>}</td>
                  <td className="text-muted">{r.category.replace(/_/g, " ")}</td>
                  <td className="num text-right">{formatInt(r.checked)}</td><td className="num text-right">{formatInt(r.failures)}</td>
                  <td className="num text-right"><span className={r.failures === 0 ? "text-pos" : r.strict ? "text-neg" : "text-muted"}>{r.pass_pct.toFixed(2)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Footnote>
        Rules: duplicate transaction IDs keep one row; negative or zero amounts and negative market values are rejected; rows pointing at an unknown client are rejected; a missing KYC
        status is loaded as "pending" and logged. "Informational" rules report a known measurement difference and do not affect the badge. Planted defects exist because the data is
        synthetic; on real data there is no answer key, which is why the business-rule checks matter. All data is synthetic.
      </Footnote>
    </div>
  );
}
