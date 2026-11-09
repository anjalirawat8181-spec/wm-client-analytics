CREATE TEMP TABLE _hold ON COMMIT DROP AS
WITH x AS (
    SELECT s.client_id, s.product_id, s.snapshot_date, s.units, s.market_value,
           to_jsonb(s) AS raw,
           (s.market_value < 0
            OR NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = s.client_id)) AS early_reject
    FROM staging.holdings_monthly s
), y AS (
    SELECT x.*,
           row_number() OVER (PARTITION BY client_id, product_id, snapshot_date, early_reject
                              ORDER BY market_value DESC NULLS LAST) AS rn
    FROM x
)
SELECT y.*,
       CASE WHEN market_value < 0 THEN 'negative_market_value'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = y.client_id) THEN 'orphan_client'
            WHEN product_id IS NULL OR snapshot_date IS NULL OR units IS NULL OR market_value IS NULL THEN 'fact_holdings_monthly_not_null'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_product p WHERE p.product_id = y.product_id) THEN 'fact_holdings_monthly_product_id_fkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_date d WHERE d.full_date = y.snapshot_date) THEN 'fact_holdings_monthly_snapshot_date_fkey'
            WHEN units < 0 THEN 'fact_holdings_monthly_units_check'
            WHEN EXTRACT(DAY FROM (snapshot_date + 1)) <> 1 THEN 'ck_holdings_snapshot_month_end'
            WHEN market_value <> round(market_value) THEN 'fact_holdings_monthly_market_value_not_integer'
            WHEN rn > 1 THEN 'fact_holdings_monthly_pkey'
       END AS reason
FROM y;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'holdings_monthly',
       coalesce(client_id::text, 'NULL') || '|' || coalesce(product_id::text, 'NULL') || '|' || coalesce(snapshot_date::text, 'NULL'),
       reason,
       CASE reason WHEN 'negative_market_value' THEN 'market_value < 0: ' || market_value::text
                   WHEN 'orphan_client' THEN 'client_id ' || coalesce(client_id::text, 'NULL') || ' not in dim_client'
                   ELSE 'rejected: ' || reason END,
       raw
FROM _hold WHERE reason IS NOT NULL;

INSERT INTO mart.fact_holdings_monthly (client_id, product_id, snapshot_date, units, market_value)
SELECT client_id, product_id, snapshot_date, units, market_value::bigint FROM _hold WHERE reason IS NULL;
