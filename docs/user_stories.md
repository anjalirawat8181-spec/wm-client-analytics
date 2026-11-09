# User stories

Status is "Done" only where a person can use it today. "Data only" means the view or file exists but no dashboard page shows it. Page names refer to the web dashboard; views are in the `analytics` schema.

## Branch head

| # | Story | Acceptance criteria | Satisfied by | Status |
|---|---|---|---|---|
| 1 | As a branch head I want to see AUM and net new money over time for my branch | Trend chart with a branch filter; latest-month tiles with change versus the prior month | Executive page; `v_monthly_cube`, `v_branch_summary` | Done |
| 2 | As a branch head I want to compare attrition across segments in my branch | Monthly attrition lines per segment respond to the branch filter | Client Health page; `v_monthly_cube` | Done |
| 3 | As a branch head I want to see what mix of assets clients hold | Stacked allocation chart by asset class, by segment | Executive page; `v_asset_allocation_mix` | Done |
| 4 | As a branch head I want revenue per client by segment | Monthly revenue per active client by segment | `v_revenue_per_client`, `revenue.json`, Excel report (firm level) | Data only (no dashboard chart) |
| 5 | As a branch head I want to know how much revenue left with churned clients | Revenue in the last month before churn, reported in the churn month | `v_revenue_lost`; shown in the weekly Excel Summary tab | Data only (not on a dashboard page) |
| 6 | As a branch head I want a weekly report in my inbox | Excel workbook with KPI deltas and a chart, plus an email draft, built every Monday | `automation/build_weekly_report.py`, `deploy.yml` (workbook is a downloadable workflow artifact; nothing is emailed automatically) | Done (draft and workbook only) |

## Advisor

| # | Story | Acceptance criteria | Satisfied by | Status |
|---|---|---|---|---|
| 7 | As an advisor I want a ranked list of clients to call first | Top clients by risk score then AUM, client IDs only, paginated | Client Health page; `v_top_clients_at_risk` | Done |
| 8 | As an advisor I want to know why a client is flagged | Each row lists the reasons (AUM drop, contact gap, idle cash) | Client Health page; `v_churn_risk_score` | Done |
| 9 | As an advisor I want to take the call list away | CSV download of the current filtered list | Client Health page | Done |
| 10 | As an advisor I want to see clients with idle cash to start a conversation | Clients with cash above 30% for 2+ month-ends | `v_flags` (idle_flag); appears only as a reason chip | Data only |
| 11 | As an advisor I want to see clients concentrated in one product | Largest non-cash product above 40% of AUM | `v_flags` (concentrated_flag) | Data only |
| 12 | As an advisor I want to compare my contact frequency and net flow rate with peers | Sortable table of all advisors with contacts per client-month and 12-month net flow rate | Advisors page; `v_advisor_scorecard` | Done |

## Data steward

| # | Story | Acceptance criteria | Satisfied by | Status |
|---|---|---|---|---|
| 13 | As a data steward I want to see how many rows were rejected and why | Counts by table and rule, with rejected versus remediated | Data Quality page; `v_data_quality_summary` | Done |
| 14 | As a data steward I want proof the checks catch what they should | Planted versus caught per defect type with missed and false positives | Data Quality page; `dq_scorecard.md` | Done |
| 15 | As a data steward I want to inspect a rejected record | Raw record kept as JSON with the rule that rejected it | `mart.dq_exceptions` (database only; not exposed on the site) | Done |
| 16 | As a data steward I want a single signal of whether the KPIs can be trusted | Badge turns green only if nothing was missed, nothing falsely flagged and no rows unaccounted | Data Quality page | Done |
| 17 | As a data steward I want to rebuild everything from scratch | Documented commands; ETL refuses to overwrite a loaded mart without an explicit confirmation flag | README "How to run"; `run_etl.py` | Done |
| 18 | As a data steward I want to look up how a KPI is defined | Definitions and edge cases in one place | Methodology page; `kpi_dictionary.md` | Done |
