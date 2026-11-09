# Analytics catalogue

Every view in the `analytics` schema, one section each: the business question it answers, the KPI dictionary rules it follows, and its grain. Definitions live in [kpi_dictionary.md](kpi_dictionary.md). SQL is in `sql/analytics/`, one file per view, applied in file order by `automation/apply_analytics.py`.

## analytics.v_snapshot_months

File: `sql/analytics/01_v_snapshot_months.sql`

- **Business question:** Which month-end snapshots does the data cover?
- **KPI dictionary refs:** Global definitions > Snapshot date (last calendar day of each month).
- **Grain:** one row per month-end snapshot present in fact_holdings_monthly.

## analytics.v_client_month_kpis

File: `sql/analytics/02_v_client_month_kpis.sql`

- **Business question:** For every client at every month-end, what is the AUM, cash share, concentration,
  contact gap and activity status that all other KPIs are built from?
- **KPI dictionary refs:** AUM (closed clients are 0 from the closure month-end), Idle Cash %, Concentration %
  (largest NON-cash product / AUM, AUM includes cash), Days Since Last Contact (connected only; falls back to
  onboarding date), Active client (open AND AUM >= 100000), Segment (fixed at onboarding).
- **Grain:** one row per client x month-end, from the client's onboarding month-end to the last snapshot.
- **Techniques:** CTEs, LAG (previous status, AUM 1 and 3 months ago), SUM OVER (segment AUM), RANK (AUM rank in segment).

## analytics.v_client_month_nnm

File: `sql/analytics/03_v_client_month_nnm.sql`

- **Business question:** How much new money did each client add or take out each month?
- **KPI dictionary refs:** Net New Money (external_in minus external_out; internal switches excluded; dated by transaction date).
- **Grain:** one row per client x calendar month (keyed by the month-end date) that has at least one external flow.

## analytics.v_monthly_aum_nnm

File: `sql/analytics/04_v_monthly_aum_nnm.sql`

- **Business question:** How are assets under management and net new money trending, in total and by segment?
- **KPI dictionary refs:** AUM, Net New Money, Active client.
- **Grain:** one row per month-end x segment, plus segment = 'All' for the firm total.

## analytics.v_attrition_monthly

File: `sql/analytics/05_v_attrition_monthly.sql`

- **Business question:** What share of last month's active clients did we lose this month?
- **KPI dictionary refs:** Attrition Rate (churned / opening; opening = active at previous month-end; clients who joined
  in the month are excluded; NULL when the denominator is 0), Churned client (active before AND (closed OR AUM < 100000 now)).
- **Grain:** one row per month-end x segment, plus segment = 'All'. The first snapshot has no previous month, so opening = 0 and the rate is NULL.

## analytics.v_attrition_trailing12

File: `sql/analytics/06_v_attrition_trailing12.sql`

- **Business question:** Over the last 12 months, what share of the clients we had a year ago have we lost?
- **KPI dictionary refs:** Attrition Rate, trailing 12-month line = clients churned in the last 12 months / clients active 12 months ago.
  Numerator counts only clients from that opening group, so the ratio can never exceed 100%.
- **Grain:** one row per month-end x segment (plus 'All'), from the 13th snapshot onward (12 months of history needed).
- **Techniques:** LAG with offset 12, MAX over a 12-row window frame.

## analytics.v_cohort_retention

File: `sql/analytics/07_v_cohort_retention.sql`

- **Business question:** Of the clients who joined in a given month, how many are still active 1, 2, ... 12 months later?
- **KPI dictionary refs:** Active client (open AND AUM >= 100000). Cohort = onboarding month, only for clients who onboarded
  after the first snapshot (earlier clients have no observable start). Clients onboarded in the first snapshot month are
  excluded: the generator creates no holdings or transactions in that month, so they are never active (see docs/data_generation_notes.md).
- **Grain:** one row per cohort month x months since onboarding (0 to 12), only where that later month-end exists in the data.
- **Techniques:** FIRST_VALUE window over the cohort to carry the cohort size.

## analytics.v_cohort_retention_summary

File: `sql/analytics/08_v_cohort_retention_summary.sql`

- **Business question:** How well do new clients stick at 3, 6 and 12 months?
- **KPI dictionary refs:** Active client; cohort definition as in v_cohort_retention.
- **Grain:** one row per cohort month, with retention % at 3, 6 and 12 months (NULL until that month is observable).

## analytics.v_flags

File: `sql/analytics/09_v_flags.sql`

- **Business question:** Which active clients show a behaviour that needs attention this month-end?
- **KPI dictionary refs:** Idle Cash % (idle = above 30% for 2 or more consecutive months), Concentration % (concentrated = above 40%),
  Days Since Last Contact (at risk 90+, critical 180+), plus an AUM-drop flag.
- **Grain:** one row per client x month-end (flags are NULL/false for clients that are not active).
- **Flag rules:**
  idle_flag               cash share > 30% this month AND last month (both months active, so AUM >= 100000)
  concentrated_flag       largest non-cash product > 40% of AUM
  contact_flag            'critical' >= 180 days, 'at_risk' >= 90 days, else 'ok' (active clients only)
  outflow_flag            AUM down more than 50% over 3 month-ends while active
  moderate_outflow_flag   AUM down 30% to 50% over 3 month-ends while active (used only by the risk score)

## analytics.v_churn_risk_score

File: `sql/analytics/10_v_churn_risk_score.sql`

- **Business question:** Which active clients are most likely to leave next, and why?
- **KPI dictionary refs:** Active client, Days Since Last Contact thresholds, Idle Cash flag, AUM-drop flag (see v_flags).
- **Grain:** one row per ACTIVE client x month-end.
  Transparent rules (points add up; no model, no hidden weights):
  AUM down > 50% over 3 month-ends ........ +3
  AUM down 30% to 50% over 3 month-ends ... +1
  no connected contact for 180+ days ...... +2   (critical)
  no connected contact for 90 to 179 days . +1   (at risk)
  idle cash flag .......................... +1
- **Level:** High = 3 or more points, Medium = 1 or 2 points, Low = 0 points.

## analytics.v_top_clients_at_risk

File: `sql/analytics/11_v_top_clients_at_risk.sql`

- **Business question:** Who should advisors call first this week?
- **KPI dictionary refs:** see v_churn_risk_score. Only client_id is exposed (no names) so the list can be shared safely.
- **Grain:** one row per High or Medium risk active client at the latest month-end, ranked by score then AUM.

## analytics.v_risk_distribution

File: `sql/analytics/12_v_risk_distribution.sql`

- **Business question:** How many active clients, and how much AUM, sit in each risk level at the latest month-end?
- **KPI dictionary refs:** see v_churn_risk_score.
- **Grain:** one row per risk level (High, Medium, Low) x segment (plus 'All') at the latest month-end.

## analytics.v_revenue_per_client

File: `sql/analytics/13_v_revenue_per_client.sql`

- **Business question:** How much fee revenue does an active client generate in a month?
- **KPI dictionary refs:** Revenue per Client (fee revenue booked in the month for clients active at month-end / count of those
  clients; monthly, not annualised; NULL when no active clients). Churned clients are excluded here and shown in v_revenue_lost.
- **Grain:** one row per month-end x segment, plus segment = 'All'.

## analytics.v_revenue_lost

File: `sql/analytics/14_v_revenue_lost.sql`

- **Business question:** How much monthly fee revenue walked out the door with the clients we lost?
- **KPI dictionary refs:** Revenue per Client edge case: revenue lost for a churned client = their fee revenue at the last month-end
  before churn, reported in the churn month. Churned client = active at previous month-end AND (closed OR AUM < 100000 now).
- **Grain:** one row per month-end x segment, plus segment = 'All', for months with at least one churned client.

## analytics.v_revenue_by_segment_branch_advisor

File: `sql/analytics/15_v_revenue_by_segment_branch_advisor.sql`

- **Business question:** Where does fee revenue come from: which segment, branch and advisor?
- **KPI dictionary refs:** Revenue per Client (clients active at month-end only).
- **Grain:** one row per month-end x segment x branch x advisor.

## analytics.v_advisor_scorecard

File: `sql/analytics/16_v_advisor_scorecard.sql`

- **Business question:** Which advisors grow their book fastest relative to the assets they look after, and which keep in touch with their clients?
- **KPI dictionary refs:** AUM, Net New Money, Active client, Days Since Last Contact (only connected interactions count).
- **Grain:** one row per advisor, measured at the latest month-end with trailing-12-month flows and contacts.
- **Measures:** net_flow_rate = trailing-12-month NNM of the advisor's clients / AUM of those clients at the opening month-end
  (organic growth rate, comparable between a large and a small book); nnm_per_client = the same NNM / average active clients;
  contacts_per_client_month = connected interactions in the 12 months / active client-months.
- **Ranks:** DENSE_RANK (1 = best). growth_rank and growth_decile follow net_flow_rate (decile 1 = highest 10%);
  contact_decile 1 = lowest 10% contact (NTILE).

## analytics.v_advisor_ranking_trend

File: `sql/analytics/17_v_advisor_ranking_trend.sql`

- **Business question:** Is an advisor climbing or slipping against peers over time?
- **KPI dictionary refs:** AUM, Net New Money (rolling 3 and 12 months); net flow rate = rolling 12-month NNM / AUM 12 month-ends earlier.
- **Grain:** one row per advisor x month-end.
- **Techniques:** DENSE_RANK per month, SUM OVER 3-row and 12-row frames, LAG of the previous rank and of AUM 12 months back.
  net_flow_rate and its rank exist from the 13th month-end onward.

## analytics.v_asset_allocation_mix

File: `sql/analytics/18_v_asset_allocation_mix.sql`

- **Business question:** How is client money split across asset classes, and does the mix differ by segment?
- **KPI dictionary refs:** AUM (all products including cash), asset_class from dim_product.
- **Grain:** one row per month-end x segment (plus 'All') x asset class, with the share of that segment's AUM.

## analytics.v_branch_summary

File: `sql/analytics/19_v_branch_summary.sql`

- **Business question:** How does each branch compare on assets, flows, revenue and client loss?
- **KPI dictionary refs:** AUM, Net New Money, Attrition Rate, Revenue per Client.
- **Grain:** one row per month-end x branch.

## analytics.v_contact_gap_attrition

File: `sql/analytics/20_v_contact_gap_attrition.sql`

- **Business question:** Do clients we have not spoken to for a while leave more often?
- **KPI dictionary refs:** Days Since Last Contact (connected only), Attrition Rate (opening = active at previous month-end).
- **Grain:** one row per contact-gap bucket x segment (plus 'All'), pooled over all months. The gap is measured at the
  PREVIOUS month-end, so it is known before the client leaves.

## analytics.v_monthly_overview

File: `sql/analytics/21_v_monthly_overview.sql`

- **Business question:** What is the firm-wide headline picture each month (the numbers on the executive page)?
- **KPI dictionary refs:** AUM, Net New Money, Attrition Rate, Revenue per Client, revenue lost, Active client.
- **Grain:** one row per month-end (firm total, segment = 'All').

## analytics.v_data_quality_summary

File: `sql/analytics/22_v_data_quality_summary.sql`

- **Business question:** How much dirty data did the pipeline find, and what happened to it?
- **KPI dictionary refs:** Global definitions > Clean data only (no duplicates, no negative amounts, no orphaned client IDs).
- **Grain:** one row per source table x rule, with the number of rows affected, how it was handled and the staging row count.

## analytics.v_monthly_cube

File: `sql/analytics/23_v_monthly_cube.sql`

- **Business question:** Can the dashboard filter every headline KPI by segment and branch at once?
- **KPI dictionary refs:** AUM, Net New Money, Active client, Attrition Rate (opening/churned, so rates are rebuilt from sums
  after filtering), Revenue per Client (fee revenue of active clients), revenue lost (last pre-churn month revenue).
- **Grain:** one row per month-end x segment x branch. Counts and sums only, so any filter combination can be re-aggregated.

