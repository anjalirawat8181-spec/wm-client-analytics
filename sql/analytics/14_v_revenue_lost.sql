CREATE OR REPLACE VIEW analytics.v_revenue_lost AS
SELECT k.snapshot_date,
       coalesce(k.segment, 'All')    AS segment,
       count(*)                      AS churned_clients,
       sum(r.fee_revenue)            AS revenue_lost
FROM analytics.v_client_month_kpis k
JOIN mart.fact_revenue r
  ON r.client_id = k.client_id
 AND r.month_end = (date_trunc('month', k.snapshot_date) - interval '1 day')::date
WHERE k.was_active AND NOT k.is_active
GROUP BY GROUPING SETS ((k.snapshot_date, k.segment), (k.snapshot_date));
