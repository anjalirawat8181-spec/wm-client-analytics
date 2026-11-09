-- ETL step 7: staging.revenue -> mart.fact_revenue
-- Rule 5 only (the dirty-data plan has no revenue defects): an unknown client violates fact_revenue_client_id_fkey.
CREATE TEMP TABLE _rev ON COMMIT DROP AS
WITH x AS (
    SELECT s.client_id, s.month_end, s.fee_revenue,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.client_id, s.month_end ORDER BY s.ctid) AS rn
    FROM staging.revenue s
)
SELECT x.*,
       CASE WHEN client_id IS NULL OR month_end IS NULL OR fee_revenue IS NULL THEN 'fact_revenue_not_null'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = x.client_id) THEN 'fact_revenue_client_id_fkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_date d WHERE d.full_date = x.month_end) THEN 'fact_revenue_month_end_fkey'
            WHEN fee_revenue < 0 OR fee_revenue <> round(fee_revenue) THEN 'fact_revenue_fee_revenue_check'
            WHEN EXTRACT(DAY FROM (month_end + 1)) <> 1 THEN 'ck_revenue_month_end'
            WHEN rn > 1 THEN 'fact_revenue_pkey'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'revenue', coalesce(client_id::text, 'NULL') || '|' || coalesce(month_end::text, 'NULL'),
       reason, 'rejected: ' || reason, raw
FROM _rev WHERE reason IS NOT NULL;

INSERT INTO mart.fact_revenue (client_id, month_end, fee_revenue)
SELECT client_id, month_end, fee_revenue::bigint FROM _rev WHERE reason IS NULL;
