import { useMemo, useState } from "react";
import { useJson } from "../lib/data";
import { useFilters } from "../lib/state";
import { formatInt, formatPct, formatRupees } from "../lib/format";
import type { AdvisorFile, AdvisorRow } from "../lib/types";
import { EmptyState, ErrorState, Footnote, PageHeader, Panel, Skeleton, Tag } from "../components/ui";

type SortKey = "growth_rank" | "aum" | "active_clients" | "net_flow_rate" | "contacts_per_client_month" | "advisor_id";

function Bar({ value, max, color }: { value: number | null; max: number; color: string }) {
  const w = value === null || max <= 0 ? 0 : Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <div className="h-1.5 w-20 rounded-full" style={{ background: "var(--grey-3)" }} aria-hidden="true">
      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: value !== null && value < 0 ? "var(--grey-1)" : color }} />
    </div>
  );
}

export default function Advisors() {
  const { filters } = useFilters();
  const { data, error } = useJson<AdvisorFile>("advisor_scorecard");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "growth_rank", dir: "asc" });

  const rows = useMemo(() => {
    const list = (data?.advisors ?? []).filter((a) => filters.branch === "All" || a.branch === filters.branch);
    const val = (a: AdvisorRow): number => (a[sort.key] as number | null) ?? -Infinity;
    return [...list].sort((a, b) => (sort.dir === "asc" ? val(a) - val(b) : val(b) - val(a)));
  }, [data, filters.branch, sort]);

  const takeaway = useMemo(() => {
    const all = (data?.advisors ?? []).filter((a) => a.net_flow_rate !== null && a.contacts_per_client_month !== null);
    if (all.length < 10) return "Loading advisor comparison.";
    const avg = (xs: AdvisorRow[], k: "net_flow_rate" | "contacts_per_client_month") => xs.reduce((s, x) => s + (x[k] ?? 0), 0) / xs.length;
    const top = all.filter((a) => a.growth_decile === 1);
    const rest = all.filter((a) => a.growth_decile > 5);
    const lowC = all.filter((a) => a.contact_decile === 1);
    const hiC = all.filter((a) => a.contact_decile === 10);
    return `The ${top.length} advisors with the highest net flow rate grew their clients' assets by ${formatPct(avg(top, "net_flow_rate"), 1)} through net new money over 12 months, against ${formatPct(avg(rest, "net_flow_rate"), 1)} for the slower half. The ${lowC.length} advisors in touch least often reach a client ${avg(lowC, "contacts_per_client_month").toFixed(2)} times a month, against ${avg(hiC, "contacts_per_client_month").toFixed(2)} for the most active ${hiC.length}.`;
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const maxN = Math.max(...rows.map((r) => Math.abs(r.net_flow_rate ?? 0)), 1e-9);
  const maxC = Math.max(...rows.map((r) => r.contacts_per_client_month ?? 0), 1e-9);
  const th = (key: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={right ? "text-right" : ""}>
      <button type="button" className="font-medium hover:text-ink" onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "growth_rank" || key === "advisor_id" ? "asc" : "desc" }))}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === "asc" ? " ↑" : " ↓"}</span>}
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader title="Advisors" takeaway={takeaway} />
      <Panel title="Advisor scorecard" subtitle={`${rows.length} advisors${filters.branch === "All" ? "" : ` in ${filters.branch}`}. Select a column heading to sort.`}>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table>
              <caption className="sr-only">Advisor scorecard</caption>
              <thead>
                <tr>
                  {th("growth_rank", "Rank")}
                  {th("advisor_id", "Advisor")}
                  <th scope="col">Branch</th>
                  {th("active_clients", "Active clients", true)}
                  {th("aum", "AUM", true)}
                  {th("net_flow_rate", "Net flow rate, 12 months")}
                  {th("contacts_per_client_month", "Contacts per client-month")}
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.advisor_id}>
                    <td className="num text-muted">{a.growth_rank}</td>
                    <td className="num font-medium text-ink">Advisor {a.advisor_id}</td>
                    <td>{a.branch}</td>
                    <td className="num text-right">{formatInt(a.active_clients)}</td>
                    <td className="num text-right">{formatRupees(a.aum)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="num w-14 text-right">{a.net_flow_rate === null ? "n/a" : formatPct(a.net_flow_rate, 1)}</span>
                        <Bar value={a.net_flow_rate} max={maxN} color="var(--accent)" />
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="num w-10 text-right">{a.contacts_per_client_month === null ? "n/a" : a.contacts_per_client_month.toFixed(2)}</span>
                        <Bar value={a.contacts_per_client_month} max={maxC} color="var(--grey-1)" />
                      </div>
                    </td>
                    <td>
                      {a.growth_decile === 1 && <Tag tone="accent">Highest net flow rate</Tag>}
                      {a.growth_decile === 1 && a.contact_decile === 1 && <span className="text-muted">, </span>}
                      {a.contact_decile === 1 && <Tag tone="neg">Lowest contact</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Footnote>
        Measured over the last 12 month-ends. Net flow rate is the advisor's clients' external inflows minus outflows over 12 months, divided by those clients' AUM at the opening
        month-end; it puts a large and a small book on the same footing. Contacts per client-month is connected interactions divided by active client-months, so missed calls and
        unanswered emails do not count. "Highest net flow rate" marks the top tenth of all advisors on that measure and "Lowest contact" the bottom tenth on contact frequency. Net
        flow rate over a single year is noisy because a few large deposits or departures move it, so a single advisor's rank should be read as a prompt to look, not a verdict. The branch
        filter applies; segment and date filters do not. All data is synthetic.
      </Footnote>
    </div>
  );
}
