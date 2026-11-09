import { useMemo } from "react";
import { useJson } from "../lib/data";
import { formatInt } from "../lib/format";
import type { DqFile } from "../lib/types";
import { ErrorState, Footnote, PageHeader, Panel, Skeleton, Tag } from "../components/ui";

export default function DataQuality() {
  const { data, error } = useJson<DqFile>("dq_scorecard");
  const stats = useMemo(() => {
    if (!data) return null;
    const planted = data.detection.reduce((s, d) => s + d.planted, 0);
    const caught = data.detection.reduce((s, d) => s + d.caught, 0);
    const fp = data.detection.reduce((s, d) => s + d.false_positives, 0);
    const missed = data.detection.reduce((s, d) => s + d.missed, 0);
    const unaccounted = data.reconciliation.reduce((s, r) => s + Math.abs(r.unaccounted), 0);
    const staging = data.reconciliation.reduce((s, r) => s + r.staging, 0);
    const rejected = data.reconciliation.reduce((s, r) => s + r.rejected_or_duplicate, 0);
    const strict = data.scorecard.filter((r) => r.strict);
    const strictPass = strict.filter((r) => r.failures === 0).length;
    const trusted = planted > 0 && missed === 0 && fp === 0 && unaccounted === 0 && strictPass === strict.length;
    return { planted, caught, fp, missed, unaccounted, staging, rejected, strict: strict.length, strictPass, trusted };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data || !stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const take =
    stats.planted > 0
      ? `The pipeline caught ${formatInt(stats.caught)} of ${formatInt(stats.planted)} planted defects with ${stats.fp} false positives. Every one of ${formatInt(stats.staging)} staged rows is either loaded or logged; ${formatInt(stats.rejected)} are kept out of the KPIs.`
      : "Planted-defect results are not available in this build.";

  return (
    <div>
      <PageHeader title="Data quality" takeaway={take} />

      <Panel>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-[13px] text-muted">Planted defects caught</p>
            <p className="display mt-1 text-[40px] leading-none text-ink sm:text-[48px]" data-testid="kpi-tile">
              {formatInt(stats.caught)}
            </p>
            <p className="mt-2 text-[13px] text-muted">of {formatInt(stats.planted)}, with {stats.missed} missed and {stats.fp} false positives</p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Rules passing</p>
            <p className="display mt-1 text-[40px] leading-none text-ink sm:text-[48px]">
              {stats.strictPass}
              <span className="text-muted"> / {stats.strict}</span>
            </p>
            <p className="mt-2 text-[13px] text-muted">{data.scorecard.length - stats.strict} further checks are informational</p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Staged rows unaccounted for</p>
            <p className="display mt-1 text-[40px] leading-none text-ink sm:text-[48px]">{formatInt(stats.unaccounted)}</p>
            <p className="mt-2 text-[13px] text-muted">{stats.trusted ? "KPIs are computed on verified data" : "At least one check needs review"}</p>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Planted versus caught" subtitle="The generator records every dirty record it injects, and the pipeline is scored against that list">
          {data.detection.length === 0 ? (
            <p className="text-sm text-muted">Not available in this build.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table>
                <caption className="sr-only">Planted defects versus defects caught</caption>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Defect</th>
                    <th className="text-right">Planted</th>
                    <th className="text-right">Caught</th>
                    <th className="text-right">Missed</th>
                    <th className="text-right">False +</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detection.map((d) => (
                    <tr key={`${d.table}${d.defect}`}>
                      <td>{d.table}</td>
                      <td>{d.defect.replace(/_/g, " ")}</td>
                      <td className="num text-right">{formatInt(d.planted)}</td>
                      <td className="num text-right">{formatInt(d.caught)}</td>
                      <td className="num text-right">{d.missed}</td>
                      <td className="num text-right">{d.false_positives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.detection_note && <p className="mt-3 text-xs text-muted">{data.detection_note}</p>}
        </Panel>

        <Panel title="What happened to the dirty rows" subtitle="Each rejected or repaired row is kept with its raw record and the rule that caught it">
          <div className="-mx-2 overflow-x-auto">
            <table>
              <caption className="sr-only">Exceptions by table and rule</caption>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Rule</th>
                  <th>Handling</th>
                  <th className="text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                {data.exceptions.map((e) => (
                  <tr key={`${e.source_table}${e.rule_name}`}>
                    <td>{e.source_table}</td>
                    <td>{e.rule_name.replace(/_/g, " ")}</td>
                    <td>
                      <Tag tone={e.handling.startsWith("rem") ? "accent" : "muted"}>{e.handling.startsWith("rem") ? "repaired" : "rejected"}</Tag>
                    </td>
                    <td className="num text-right">{formatInt(e.rows_affected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6" title="All checks" subtitle={data.generated_at ? `Last run ${data.generated_at.slice(0, 10)}` : undefined}>
        <div className="-mx-2 max-h-[460px] overflow-auto">
          <table>
            <caption className="sr-only">All data quality checks</caption>
            <thead className="sticky top-0 bg-[var(--panel)]">
              <tr>
                <th>Check</th>
                <th>Category</th>
                <th className="text-right">Checked</th>
                <th className="text-right">Failures</th>
                <th className="text-right">Pass</th>
              </tr>
            </thead>
            <tbody>
              {data.scorecard.map((r) => (
                <tr key={r.rule}>
                  <td className="font-medium text-ink">
                    {r.rule.replace(/_/g, " ")}
                    {!r.strict && <span className="ml-2 text-xs font-normal text-muted">informational</span>}
                  </td>
                  <td className="text-muted">{r.category.replace(/_/g, " ")}</td>
                  <td className="num text-right">{formatInt(r.checked)}</td>
                  <td className="num text-right">{formatInt(r.failures)}</td>
                  <td className="num text-right">{r.pass_pct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Footnote>
        Duplicate transaction IDs keep one row; negative or zero amounts and negative market values are rejected; rows pointing at an unknown client are rejected; a missing KYC status is
        loaded as pending and logged. Informational checks report a known measurement difference and do not change the summary. Planted defects exist because the data is synthetic; on real
        data there is no answer list, which is why the business-rule checks matter. All data is synthetic.
      </Footnote>
    </div>
  );
}
