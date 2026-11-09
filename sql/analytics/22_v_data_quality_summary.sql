CREATE OR REPLACE VIEW analytics.v_data_quality_summary AS
WITH stg AS (
    SELECT 'advisors' AS source_table, count(*) AS staging_rows FROM staging.advisors
    UNION ALL SELECT 'clients', count(*) FROM staging.clients
    UNION ALL SELECT 'products', count(*) FROM staging.products
    UNION ALL SELECT 'transactions', count(*) FROM staging.transactions
    UNION ALL SELECT 'holdings_monthly', count(*) FROM staging.holdings_monthly
    UNION ALL SELECT 'interactions', count(*) FROM staging.interactions
    UNION ALL SELECT 'revenue', count(*) FROM staging.revenue
)
SELECT e.source_table, e.rule_name,
       CASE WHEN e.rule_name = 'null_kyc' THEN 'remediated (promoted as pending)' ELSE 'rejected' END AS handling,
       count(*)                                                    AS rows_affected,
       s.staging_rows,
       round(100.0 * count(*) / s.staging_rows, 2)                 AS pct_of_staging
FROM mart.dq_exceptions e
JOIN stg s ON s.source_table = e.source_table
GROUP BY e.source_table, e.rule_name, s.staging_rows;
