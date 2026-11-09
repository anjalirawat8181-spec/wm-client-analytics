-- View: analytics.v_attrition_monthly
-- Business question: What share of last month's active clients did we lose this month?
-- KPI dictionary refs: Attrition Rate (churned / opening; opening = active at previous month-end; clients who joined
--   in the month are excluded; NULL when the denominator is 0), Churned client (active before AND (closed OR AUM < 100000 now)).
-- Grain: one row per month-end x segment, plus segment = 'All'. The first snapshot has no previous month, so opening = 0 and the rate is NULL.
CREATE OR REPLACE VIEW analytics.v_attrition_monthly AS
SELECT k.snapshot_date,
       coalesce(k.segment, 'All')                                          AS segment,
       count(*) FILTER (WHERE k.was_active)                                AS opening_clients,
       count(*) FILTER (WHERE k.was_active AND NOT k.is_active)            AS churned_clients,
       count(*) FILTER (WHERE k.is_new_client)                             AS new_clients,
       count(*) FILTER (WHERE k.is_active)                                 AS closing_clients,
       count(*) FILTER (WHERE k.was_active AND NOT k.is_active)::numeric
         / NULLIF(count(*) FILTER (WHERE k.was_active), 0)                 AS attrition_rate
FROM analytics.v_client_month_kpis k
GROUP BY GROUPING SETS ((k.snapshot_date, k.segment), (k.snapshot_date));
