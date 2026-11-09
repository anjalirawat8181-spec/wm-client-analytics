-- ETL step 2: staging.products -> mart.dim_product
CREATE TEMP TABLE _prod ON COMMIT DROP AS
WITH x AS (
    SELECT s.product_id, s.product_name, s.asset_class, s.fund_house, s.fee_pct,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.product_id ORDER BY s.ctid) AS rn,
           row_number() OVER (PARTITION BY s.product_name ORDER BY s.ctid) AS rn_name
    FROM staging.products s
)
SELECT x.*,
       CASE WHEN product_id IS NULL OR product_name IS NULL OR asset_class IS NULL
                 OR fund_house IS NULL OR fee_pct IS NULL THEN 'dim_product_not_null'
            WHEN rn > 1 THEN 'dim_product_pkey'
            WHEN rn_name > 1 THEN 'dim_product_product_name_key'
            WHEN asset_class NOT IN ('Equity','Debt','Hybrid','Gold','Cash','Alternatives') THEN 'dim_product_asset_class_check'
            WHEN fee_pct NOT BETWEEN 0 AND 5 OR fee_pct <> round(fee_pct, 2) THEN 'dim_product_fee_pct_check'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'products', product_id::text, reason, 'rejected: ' || reason, raw FROM _prod WHERE reason IS NOT NULL;

INSERT INTO mart.dim_product (product_id, product_name, asset_class, fund_house, fee_pct)
SELECT product_id, product_name, asset_class, fund_house, fee_pct FROM _prod WHERE reason IS NULL;
