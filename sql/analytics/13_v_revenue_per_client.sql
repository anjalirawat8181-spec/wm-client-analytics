CREATE OR REPLACE VIEW analytics.v_revenue_per_client AS
SELECT k.snapshot_date,
       coalesce(k.segment, 'All')                              AS segment,
       count(*)                                                AS active_clients,
       sum(r.fee_revenue)                                      AS fee_revenue,
       sum(r.fee_revenue)::numeric / NULLIF(count(*), 0)       AS revenue_per_client
FROM analytics.v_client_month_kpis k
JOIN mart.fact_revenue r ON r.client_id = k.client_id AND r.month_end = k.snapshot_date
WHERE k.is_active
GROUP BY GROUPING SETS ((k.snapshot_date, k.segment), (k.snapshot_date));
