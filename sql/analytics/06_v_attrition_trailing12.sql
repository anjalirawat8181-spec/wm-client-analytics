CREATE OR REPLACE VIEW analytics.v_attrition_trailing12 AS
WITH x AS (
    SELECT k.client_id, k.segment, k.snapshot_date,
           lag(k.is_active, 12) OVER w AS active_12m_ago,
           max((coalesce(k.was_active, false) AND NOT k.is_active)::int)
               OVER (w ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS churned_in_last_12m
    FROM analytics.v_client_month_kpis k
    WINDOW w AS (PARTITION BY k.client_id ORDER BY k.snapshot_date)
)
SELECT x.snapshot_date,
       coalesce(x.segment, 'All')                                                 AS segment,
       count(*) FILTER (WHERE x.active_12m_ago)                                   AS clients_active_12m_ago,
       count(*) FILTER (WHERE x.active_12m_ago AND x.churned_in_last_12m = 1)     AS churned_in_last_12m,
       count(*) FILTER (WHERE x.active_12m_ago AND x.churned_in_last_12m = 1)::numeric
         / NULLIF(count(*) FILTER (WHERE x.active_12m_ago), 0)                    AS attrition_trailing_12m
FROM x
WHERE x.active_12m_ago IS NOT NULL
GROUP BY GROUPING SETS ((x.snapshot_date, x.segment), (x.snapshot_date));
