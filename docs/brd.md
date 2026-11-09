# Business Requirements Document

Project: wm-client-analytics. All data is synthetic; the business context is a fictional wealth-management firm with four branches (Mumbai, Delhi NCR, Bengaluru, Pune), 60 advisors and 5,000 clients.

## 1. Background

Branch heads and advisors want to know where assets are growing, which clients are about to leave, and which advisors need support. Today (in this fictional firm) those answers come from ad hoc spreadsheets whose definitions differ by team. The project builds one governed pipeline, from raw extracts to a dashboard, with written KPI definitions and proof that the data feeding them is clean.

## 2. Objectives

1. One written definition for each KPI (AUM, net new money, attrition, revenue per client, idle cash, concentration, days since last contact), applied identically in every query. See [kpi_dictionary.md](kpi_dictionary.md).
2. A clean, constrained mart that rejects and logs bad records instead of silently loading them.
3. An early-warning view that tells advisors which clients to call first, and why.
4. A dashboard that leadership can open without installing anything, refreshed weekly.
5. Evidence, not assertion: every data-quality and KPI claim is tested against an independent calculation.

## 3. Stakeholders

| Stakeholder | Interest | Uses |
|---|---|---|
| Branch head | Branch growth, attrition, revenue | Executive and Client Health pages, weekly report |
| Advisor | Which clients to contact, how they compare to peers | Clients to call first table, Advisors page |
| Data steward | Trust in the numbers | Data Quality page, `dq_scorecard.md`, `mart.dq_exceptions` |
| Head of analytics (sponsor) | Reuse of the method | Whole repository |

## 4. Scope

In scope:
- Synthetic data generation with known planted patterns and known planted defects.
- Staging, ETL, data-quality rules and scorecard, analytics views, validation against truth files.
- Static web dashboard (5 pages), weekly Excel report, CI and scheduled deployment.

Out of scope:
- Real client data, authentication, row-level security, live (non-snapshot) data, forecasting models, a Tableau workbook (optional extension, not built).

## 5. Assumptions

- Active client = account open and AUM of at least Rs 1 lakh at month-end; churned = active last month-end and closed or below Rs 1 lakh now.
- Segment is fixed at onboarding by onboarding AUM (Rs 25 lakh and Rs 5 crore fall in HNI).
- Money is in whole rupees; the dashboard reports lakh and crore.
- Returning clients are not simulated; January 2025 joiners have no holdings (a generator limitation recorded in [data_generation_notes.md](data_generation_notes.md)).
- The database is a free-tier Neon instance, so total size must stay under 400 MB of the 512 MB limit.

## 6. Functional requirements

| ID | Requirement |
|---|---|
| FR1 | Load raw files to `staging` unchanged, with row counts reconciled to the generator's summary. |
| FR2 | Promote to `mart` in one transaction; log every rejected or remediated row with its raw record. |
| FR3 | Provide at least 18 documented analytics views covering every KPI in the dictionary. |
| FR4 | Flag idle cash, concentration, contact gaps and large AUM drops; score churn risk with transparent rules. |
| FR5 | Publish a static dashboard with segment, branch and date filters. |
| FR6 | Produce a weekly Excel report and email draft from the same data as the dashboard. |
| FR7 | Rebuild and redeploy on every push to main and every Monday. |

## 7. Non-functional requirements

- Reproducible: the same seed gives byte-identical data.
- Secure: no secrets in the repository; the CI database URL comes only from a repository secret; the site is static and never touches the database; no client names are exported.
- Accessible: keyboard operable, WCAG AA contrast, works from 360 px wide.

## 8. Success metrics

Each metric is checked by a script and reported in a generated document, not asserted here.

| Metric | Target | Where measured |
|---|---|---|
| Planted dirty records caught | 100%, 0 false positives | [dq_scorecard.md](dq_scorecard.md) |
| Every staged row loaded or logged | 0 unaccounted | [dq_scorecard.md](dq_scorecard.md) |
| Views match independent calculation | all cross-checks pass | [analytics_validation.md](analytics_validation.md) |
| Planted churners recovered | recall and precision of at least 95% | [analytics_validation.md](analytics_validation.md) |
| Dashboard numbers match SQL | all checked numbers match | [dashboard_qa.md](dashboard_qa.md) |
| Dashboard accessibility | Lighthouse accessibility of 90 or more | [dashboard_qa.md](dashboard_qa.md) |
| Pipeline unattended | scheduled deployment succeeds | GitHub Actions history |
