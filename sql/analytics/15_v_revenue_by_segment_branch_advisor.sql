-- View: analytics.v_revenue_by_segment_branch_advisor
-- Business question: Where does fee revenue come from: which segment, branch and advisor?
-- KPI dictionary refs: Revenue per Client (clients active at month-end only).
-- Grain: one row per month-end x segment x branch x advisor.
CREATE OR REPLACE VIEW analytics.v_revenue_by_segment_branch_advisor AS
SELECT k.snapshot_date, k.segment, k.branch, k.advisor_id,
       count(*)                                          AS active_clients,
       sum(r.fee_revenue)                                AS fee_revenue,
       sum(r.fee_revenue)::numeric / NULLIF(count(*), 0) AS revenue_per_client
FROM analytics.v_client_month_kpis k
JOIN mart.fact_revenue r ON r.client_id = k.client_id AND r.month_end = k.snapshot_date
WHERE k.is_active
GROUP BY k.snapshot_date, k.segment, k.branch, k.advisor_id;
