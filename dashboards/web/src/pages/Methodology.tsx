import { REPO_URL } from "../lib/env";
import { useJson } from "../lib/data";
import { formatMonth } from "../lib/format";
import type { Meta } from "../lib/types";
import { Footnote, PageHeader, Panel } from "../components/ui";

const KPIS: { name: string; rule: string }[] = [
  { name: "AUM", rule: "Sum of market value across all products, cash included, at the last day of the month. Closed clients count as 0 from the closure month-end. Negative market values are treated as dirty data and excluded." },
  { name: "Net new money", rule: "External inflows (deposits, SIPs) minus external outflows (withdrawals, redemptions) in the month. Switches between products are internal and excluded. Market gains and losses are excluded. Can be negative." },
  { name: "Active client", rule: "Account open and AUM of at least Rs 1 lakh at the month-end." },
  { name: "Attrition rate", rule: "Clients active at the previous month-end who closed or fell below Rs 1 lakh, divided by clients active at the previous month-end. Clients who joined in the month are excluded. A trailing 12-month line divides clients churned in the last 12 months by clients active 12 months ago." },
  { name: "Revenue per client", rule: "Fee revenue booked in the month for clients active at month-end, divided by the number of those clients. Monthly, not annualised. Revenue lost from a churned client is their revenue in the last month-end before they left, shown in the churn month." },
  { name: "Idle cash", rule: "Cash share of AUM. A client is flagged idle when it is above 30% for 2 or more consecutive months. Clients below Rs 1 lakh are excluded." },
  { name: "Concentration", rule: "Largest single non-cash product divided by AUM (AUM still includes cash). Flagged above 40%. A cash-only client has no concentration." },
  { name: "Days since last contact", rule: "Month-end minus the date of the latest connected interaction (missed calls and unanswered emails do not count). Never contacted: days since onboarding. At risk from 90 days, critical from 180." },
  { name: "Net flow rate", rule: "For an advisor: net new money of their clients over 12 months divided by those clients' AUM at the opening month-end. Used to compare advisors with books of different sizes." },
  { name: "Segment", rule: "Fixed at onboarding by onboarding AUM: Mass Affluent below Rs 25 lakh, HNI from Rs 25 lakh to Rs 5 crore (both boundaries included), UHNI above Rs 5 crore." },
];

const STEPS = ["Synthetic generator", "Staging", "ETL and quality rules", "Mart", "Analytics views", "JSON export", "Static site"];

function Lineage() {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm" aria-label={`Data lineage: ${STEPS.join(", then ")}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`rounded-xl px-3 py-1.5 ${i === 3 ? "font-medium text-accent" : "text-ink"}`} style={{ background: "var(--line)" }}>
            {s}
          </span>
          {i < STEPS.length - 1 && (
            <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
              <path d="M0 5h14M10 1l4 4-4 4" fill="none" stroke="var(--grey-1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function Methodology() {
  const meta = useJson<Meta>("meta");
  const m = meta.data;
  return (
    <div>
      <PageHeader title="Methodology" takeaway="How each number on this site is defined, where it comes from, and what to be careful about." />

      <Panel title="About the data">
        <p className="max-w-3xl text-[15px] leading-relaxed text-ink">
          Every client, advisor, balance and transaction here is fictional and produced by a seeded generator. The generator plants known behaviours (clients who are not contacted
          leave more often, differences between segments and advisors, outflows before a client leaves) and a known set of dirty records. The patterns are found because they were put
          there. What this project demonstrates is the method: modelling, cleaning, KPI definition, validation and delivery.
        </p>
      </Panel>

      <Panel className="mt-6" title="Where the numbers come from" subtitle="Each step is a script in the repository; nothing is edited by hand">
        <Lineage />
      </Panel>

      <Panel className="mt-6" title="KPI definitions" subtitle="Shortened from the KPI dictionary, which is the single source of truth">
        <dl className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {KPIS.map((k) => (
            <div key={k.name}>
              <dt className="text-sm font-medium text-ink">{k.name}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{k.rule}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="This build">
          {m ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Data window</dt>
                <dd className="num text-ink">
                  {formatMonth(m.data_window.first_month_end)} to {formatMonth(m.data_window.last_month_end)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Month-ends</dt>
                <dd className="num text-ink">{m.data_window.months}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Built</dt>
                <dd className="num text-ink">{m.generated_at.slice(0, 16).replace("T", " ")} UTC</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Commit</dt>
                <dd className="num text-ink">{m.commit}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Clients in the mart</dt>
                <dd className="num text-ink">{m.row_counts.dim_client?.toLocaleString("en-IN")}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">Loading build details.</p>
          )}
        </Panel>
        <Panel title="Limitations">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>This is a snapshot taken at the last build, not a live feed.</li>
            <li>Returning clients are not simulated: a client who leaves never comes back.</li>
            <li>Returns come from a statistical model, not real fund prices.</li>
            <li>Advisor growth over one year is noisy; treat rankings as a prompt to look, not a verdict.</li>
          </ul>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">
            Source code and full documentation
          </a>
        </Panel>
      </div>
      <Footnote>Definitions here are shortened; the full KPI dictionary, with edge cases and a worked example, is in the repository under docs/kpi_dictionary.md.</Footnote>
    </div>
  );
}
