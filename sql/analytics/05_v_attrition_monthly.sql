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
