-- View: analytics.v_monthly_cube
-- Business question: Can the dashboard filter every headline KPI by segment and branch at once?
-- KPI dictionary refs: AUM, Net New Money, Active client, Attrition Rate (opening/churned, so rates are rebuilt from sums
--   after filtering), Revenue per Client (fee revenue of active clients), revenue lost (last pre-churn month revenue).
-- Grain: one row per month-end x segment x branch. Counts and sums only, so any filter combination can be re-aggregated.
CREATE OR REPLACE VIEW analytics.v_monthly_cube AS
SELECT k.snapshot_date, k.segment, k.branch,
       sum(k.aum)                                                         AS aum,
       count(*) FILTER (WHERE k.is_active)                                AS active_clients,
       coalesce(sum(n.inflows), 0)                                        AS inflows,
       coalesce(sum(n.outflows), 0)                                       AS outflows,
       coalesce(sum(n.nnm), 0)                                            AS nnm,
       count(*) FILTER (WHERE k.was_active)                               AS opening_clients,
       count(*) FILTER (WHERE k.was_active AND NOT k.is_active)           AS churned_clients,
       count(*) FILTER (WHERE k.is_new_client)                            AS new_clients,
       coalesce(sum(r.fee_revenue) FILTER (WHERE k.is_active), 0)         AS fee_revenue,
       coalesce(sum(p.fee_revenue) FILTER (WHERE k.was_active AND NOT k.is_active), 0) AS revenue_lost
FROM analytics.v_client_month_kpis k
LEFT JOIN analytics.v_client_month_nnm n ON n.client_id = k.client_id AND n.snapshot_date = k.snapshot_date
LEFT JOIN mart.fact_revenue r ON r.client_id = k.client_id AND r.month_end = k.snapshot_date
LEFT JOIN mart.fact_revenue p ON p.client_id = k.client_id
                             AND p.month_end = (date_trunc('month', k.snapshot_date) - interval '1 day')::date
GROUP BY k.snapshot_date, k.segment, k.branch;
