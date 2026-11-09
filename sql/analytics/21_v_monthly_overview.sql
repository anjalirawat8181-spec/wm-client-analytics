-- View: analytics.v_monthly_overview
-- Business question: What is the firm-wide headline picture each month (the numbers on the executive page)?
-- KPI dictionary refs: AUM, Net New Money, Attrition Rate, Revenue per Client, revenue lost, Active client.
-- Grain: one row per month-end (firm total, segment = 'All').
CREATE OR REPLACE VIEW analytics.v_monthly_overview AS
SELECT a.snapshot_date,
       a.aum, a.nnm, a.inflows, a.outflows, a.active_clients,
       t.opening_clients, t.churned_clients, t.new_clients, t.attrition_rate,
       r.fee_revenue, r.revenue_per_client,
       coalesce(l.revenue_lost, 0) AS revenue_lost
FROM analytics.v_monthly_aum_nnm a
JOIN analytics.v_attrition_monthly t ON t.snapshot_date = a.snapshot_date AND t.segment = 'All'
LEFT JOIN analytics.v_revenue_per_client r ON r.snapshot_date = a.snapshot_date AND r.segment = 'All'
LEFT JOIN analytics.v_revenue_lost l ON l.snapshot_date = a.snapshot_date AND l.segment = 'All'
WHERE a.segment = 'All';
