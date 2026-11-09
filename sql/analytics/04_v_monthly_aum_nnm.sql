-- View: analytics.v_monthly_aum_nnm
-- Business question: How are assets under management and net new money trending, in total and by segment?
-- KPI dictionary refs: AUM, Net New Money, Active client.
-- Grain: one row per month-end x segment, plus segment = 'All' for the firm total.
CREATE OR REPLACE VIEW analytics.v_monthly_aum_nnm AS
SELECT k.snapshot_date,
       coalesce(k.segment, 'All')                       AS segment,
       sum(k.aum)                                        AS aum,
       count(*) FILTER (WHERE k.is_active)               AS active_clients,
       coalesce(sum(n.inflows), 0)                       AS inflows,
       coalesce(sum(n.outflows), 0)                      AS outflows,
       coalesce(sum(n.nnm), 0)                           AS nnm
FROM analytics.v_client_month_kpis k
LEFT JOIN analytics.v_client_month_nnm n
       ON n.client_id = k.client_id AND n.snapshot_date = k.snapshot_date
GROUP BY GROUPING SETS ((k.snapshot_date, k.segment), (k.snapshot_date));
