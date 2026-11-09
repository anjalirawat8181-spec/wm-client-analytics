-- View: analytics.v_branch_summary
-- Business question: How does each branch compare on assets, flows, revenue and client loss?
-- KPI dictionary refs: AUM, Net New Money, Attrition Rate, Revenue per Client.
-- Grain: one row per month-end x branch.
CREATE OR REPLACE VIEW analytics.v_branch_summary AS
SELECT k.snapshot_date, k.branch,
       sum(k.aum)                                                        AS aum,
       count(*) FILTER (WHERE k.is_active)                               AS active_clients,
       coalesce(sum(n.nnm), 0)                                           AS nnm,
       coalesce(sum(r.fee_revenue) FILTER (WHERE k.is_active), 0)        AS fee_revenue,
       count(*) FILTER (WHERE k.was_active)                              AS opening_clients,
       count(*) FILTER (WHERE k.was_active AND NOT k.is_active)          AS churned_clients,
       count(*) FILTER (WHERE k.was_active AND NOT k.is_active)::numeric
         / NULLIF(count(*) FILTER (WHERE k.was_active), 0)               AS attrition_rate
FROM analytics.v_client_month_kpis k
LEFT JOIN analytics.v_client_month_nnm n ON n.client_id = k.client_id AND n.snapshot_date = k.snapshot_date
LEFT JOIN mart.fact_revenue r ON r.client_id = k.client_id AND r.month_end = k.snapshot_date
GROUP BY k.snapshot_date, k.branch;
