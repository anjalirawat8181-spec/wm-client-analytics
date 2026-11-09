import { ExternalLink } from "lucide-react";
import { REPO_URL } from "../lib/env";
import { useJson } from "../lib/data";
import { formatMonth } from "../lib/format";
import type { Meta } from "../lib/types";
import { Card, Footnote, PageHeader } from "../components/ui";

const KPIS: { name: string; rule: string }[] = [
  { name: "AUM", rule: "Sum of market value across all products, cash included, at the last day of the month. Closed clients count as 0 from the closure month-end. Negative market values are treated as dirty data and excluded." },
  { name: "Net new money", rule: "External inflows (deposits, SIPs) minus external outflows (withdrawals, redemptions) in the month. Switches between products are internal and excluded. Market gains and losses are excluded. Can be negative." },
  { name: "Active client", rule: "Account open and AUM of at least Rs 1 lakh at the month-end." },
  { name: "Attrition rate", rule: "Clients active at the previous month-end who closed or fell below Rs 1 lakh, divided by clients active at the previous month-end. Clients who joined in the month are excluded. A trailing 12-month line divides clients churned in the last 12 months by clients active 12 months ago." },
  { name: "Revenue per client", rule: "Fee revenue booked in the month for clients active at month-end, divided by the number of those clients. Monthly, not annualised. Revenue lost from a churned client is their revenue in the last month-end before they left, shown in the churn month." },
  { name: "Idle cash", rule: "Cash share of AUM. A client is flagged idle when it is above 30% for 2 or more consecutive months. Clients below Rs 1 lakh are excluded." },
  { name: "Concentration", rule: "Largest single non-cash product divided by AUM (AUM still includes cash). Flagged above 40%. A cash-only client has no concentration." },
  { name: "Days since last contact", rule: "Month-end minus the date of the latest connected interaction (missed calls and unanswered emails do not count). Never contacted: days since onboarding. At risk from 90 days, critical from 180." },
  { name: "Segment", rule: "Fixed at onboarding by onboarding AUM: Mass Affluent below Rs 25 lakh, HNI from Rs 25 lakh to Rs 5 crore (both boundaries included), UHNI above Rs 5 crore." },
];

const STEPS = ["Synthetic generator", "Staging (raw, dirty)", "ETL and quality rules", "Mart (star schema)", "Analytics views", "JSON export", "Static dashboard"];

function Lineage() {
  const w = 150, gap = 22, h = 64;
  return (
    <div className="overflow-x-auto">
      <svg width={STEPS.length * (w + gap)} height={h + 30} role="img" aria-label={`Data lineage: ${STEPS.join(", then ")}`} className="min-w-full">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" /></marker>
        </defs>
        {STEPS.map((s, i) => {
          const x = i * (w + gap) + 4;
          const [a, ...rest] = s.split(" (");
          return (
            <g key={s}>
              <rect x={x} y={14} width={w - 8} height={h} rx={12} fill="var(--surface2)" stroke={i === 3 ? "var(--gold)" : "var(--border)"} strokeWidth={i === 3 ? 2 : 1} />
              <text x={x + (w - 8) / 2} y={h / 2 + 12} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 12.5, fontWeight: 600 }}>{a}</text>
              {rest.length > 0 && <text x={x + (w - 8) / 2} y={h / 2 + 30} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>({rest.join(" (")}</text>}
              {i < STEPS.length - 1 && <line x1={x + w - 6} y1={14 + h / 2} x2={x + w + gap - 8} y2={14 + h / 2} stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arrow)" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Methodology() {
  const meta = useJson<Meta>("meta");
  const m = meta.data;
  return (
    <div>
      <PageHeader title="Methodology" takeaway="How every number on this site is defined, where it comes from and why you can trust or question it." />

      <Card title="Synthetic data disclaimer" className="border-gold/40">
        <p className="text-sm leading-relaxed text-ink">
          Every client, advisor, balance and transaction here is fictional and produced by a seeded generator. The generator plants known behaviours (clients who are not contacted
          leave more often, differences between segments and advisors, outflows before a client leaves) and a known set of dirty records. The patterns are found because they were
          put there; what this project demonstrates is the method: modelling, cleaning, KPI definition, validation and delivery.
        </p>
      </Card>

      <Card className="mt-4" title="Data lineage" subtitle="Each arrow is a script in the repository; nothing is edited by hand">
        <Lineage />
      </Card>

      <Card className="mt-4" title="KPI definitions" subtitle="Condensed from the KPI dictionary, which is the single source of truth">
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {KPIS.map((k) => (
            <div key={k.name}>
              <dt className="text-sm font-semibold text-gold2">{k.name}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-muted">{k.rule}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Build details">
          {m ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Data window</dt><dd className="num text-ink">{formatMonth(m.data_window.first_month_end)} to {formatMonth(m.data_window.last_month_end)} ({m.data_window.months} month-ends)</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Generated</dt><dd className="num text-ink">{m.generated_at.slice(0, 16).replace("T", " ")} UTC</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Commit</dt><dd className="num text-ink">{m.commit}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Clients in the mart</dt><dd className="num text-ink">{m.row_counts.dim_client?.toLocaleString("en-IN")}</dd></div>
            </dl>
          ) : <p className="text-sm text-muted">Loading build details.</p>}
        </Card>
        <Card title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Snapshot dashboard: it shows the data as of the last build, not a live feed.</li>
            <li>Returning clients are not simulated: a client who leaves never comes back.</li>
            <li>Returns come from a statistical factor model, not real fund prices.</li>
            <li>Advisor growth rankings are noisy over a single year; treat them as a prompt to look, not a verdict.</li>
          </ul>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold2 underline-offset-2 hover:underline">
            Source code and full documentation <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Card>
      </div>
      <Footnote>Definitions here are shortened; the full KPI dictionary with edge cases and a worked example is in the repository under docs/kpi_dictionary.md.</Footnote>
    </div>
  );
}
