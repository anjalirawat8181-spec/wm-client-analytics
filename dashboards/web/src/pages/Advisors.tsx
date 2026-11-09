import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useJson } from "../lib/data";
import { useFilters } from "../lib/state";
import { formatInt, formatRupees } from "../lib/format";
import type { AdvisorFile, AdvisorRow } from "../lib/types";
import { Badge, Card, EmptyState, ErrorState, Footnote, PageHeader, Skeleton } from "../components/ui";

type SortKey = "growth_rank" | "aum" | "active_clients" | "nnm_per_client" | "contacts_per_client_month" | "advisor_id";

function Bar({ value, max, color }: { value: number | null; max: number; color: string }) {
  const w = value === null || max <= 0 ? 0 : Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <div className="h-1.5 w-24 rounded-full bg-surface2" aria-hidden="true">
      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: value !== null && value < 0 ? "var(--negative)" : color }} />
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
    const all = data?.advisors ?? [];
    const withData = all.filter((a) => a.nnm_per_client !== null && a.contacts_per_client_month !== null);
    if (withData.length < 10) return "Loading advisor comparison.";
    const top = withData.filter((a) => a.nnm_decile === 1), rest = withData.filter((a) => a.nnm_decile > 5);
    const avg = (xs: AdvisorRow[], k: "nnm_per_client" | "contacts_per_client_month") => xs.reduce((s, x) => s + (x[k] ?? 0), 0) / xs.length;
    const lowC = withData.filter((a) => a.contact_decile === 1), hiC = withData.filter((a) => a.contact_decile === 10);
    return `The ${top.length} fastest-growing advisors add ${formatRupees(avg(top, "nnm_per_client"))} of net new money per client a year against ${formatRupees(avg(rest, "nnm_per_client"))} for the slower half; the ${lowC.length} least-in-touch advisors reach a client ${avg(lowC, "contacts_per_client_month").toFixed(2)} times a month against ${avg(hiC, "contacts_per_client_month").toFixed(2)} for the most active ${hiC.length}.`;
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96" /></div>;

  const maxN = Math.max(...rows.map((r) => Math.abs(r.nnm_per_client ?? 0)), 1);
  const maxC = Math.max(...rows.map((r) => r.contacts_per_client_month ?? 0), 1);
  const th = (key: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={right ? "text-right" : ""}>
      <button type="button" className="inline-flex items-center gap-1 font-semibold hover:text-ink"
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "growth_rank" || key === "advisor_id" ? "asc" : "desc" }))}>
        {label}
        {sort.key === key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader title="Advisor scorecard" takeaway={takeaway} />
      <Card title="Advisors" subtitle={`${rows.length} advisors${filters.branch === "All" ? "" : ` in ${filters.branch}`}; click a column to sort`}>
        {rows.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table>
              <caption className="sr-only">Advisor scorecard</caption>
              <thead>
                <tr>
                  {th("growth_rank", "Growth rank")}{th("advisor_id", "Advisor")}<th scope="col">Branch</th>
                  {th("active_clients", "Active clients", true)}{th("aum", "AUM", true)}
                  {th("nnm_per_client", "NNM per client (12m)")}{th("contacts_per_client_month", "Contacts per client-month")}<th scope="col">Flags</th>
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
                    <td><div className="flex items-center gap-2"><span className="num w-24 text-right">{formatRupees(a.nnm_per_client)}</span><Bar value={a.nnm_per_client} max={maxN} color="var(--positive)" /></div></td>
                    <td><div className="flex items-center gap-2"><span className="num w-10 text-right">{a.contacts_per_client_month === null ? "n/a" : a.contacts_per_client_month.toFixed(2)}</span><Bar value={a.contacts_per_client_month} max={maxC} color="var(--c1)" /></div></td>
                    <td>
                      {a.nnm_decile === 1 && <Badge tone="pos">High growth</Badge>}{" "}
                      {a.contact_decile === 1 && <Badge tone="neg">Low contact</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Footnote>
        Measured over the last 12 month-ends. Net new money per client = the advisor's clients' external inflows minus outflows, divided by the average number of active
        clients. Contacts per client-month = connected interactions divided by active client-months (missed calls and unanswered emails do not count). "High growth" marks the top
        decile of all advisors by net new money per client; "Low contact" marks the bottom decile by contact frequency. Net new money per client is driven by a few large deposits,
        so single-advisor ranks move from year to year; contact frequency is a steadier signal. The branch filter applies; segment and date filters do not. All data is synthetic.
      </Footnote>
    </div>
  );
}
