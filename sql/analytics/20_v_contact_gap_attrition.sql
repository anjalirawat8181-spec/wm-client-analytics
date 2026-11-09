CREATE OR REPLACE VIEW analytics.v_contact_gap_attrition AS
WITH x AS (
    SELECT k.segment, k.was_active, k.is_active,
           lag(k.days_since_last_contact) OVER (PARTITION BY k.client_id ORDER BY k.snapshot_date) AS prior_gap
    FROM analytics.v_client_month_kpis k
),
b AS (
    SELECT x.*,
           CASE WHEN x.prior_gap >= 180 THEN 4 WHEN x.prior_gap >= 90 THEN 3 WHEN x.prior_gap >= 30 THEN 2 ELSE 1 END AS bucket_order,
           CASE WHEN x.prior_gap >= 180 THEN '180+ days' WHEN x.prior_gap >= 90 THEN '90-179 days'
                WHEN x.prior_gap >= 30 THEN '30-89 days' ELSE '0-29 days' END AS gap_bucket
    FROM x
    WHERE x.was_active
)
SELECT b.bucket_order, b.gap_bucket, coalesce(b.segment, 'All') AS segment,
       count(*)                                    AS opening_clients,
       count(*) FILTER (WHERE NOT b.is_active)     AS churned_clients,
       count(*) FILTER (WHERE NOT b.is_active)::numeric / NULLIF(count(*), 0) AS attrition_rate
FROM b
GROUP BY GROUPING SETS ((b.bucket_order, b.gap_bucket, b.segment), (b.bucket_order, b.gap_bucket));
