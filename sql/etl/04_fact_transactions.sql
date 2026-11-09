CREATE TEMP TABLE _txn ON COMMIT DROP AS
WITH x AS (
    SELECT s.txn_id, s.client_id, s.product_id, s.txn_date, s.txn_type, s.flow_type, s.amount,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.txn_id ORDER BY s.ctid) AS rn
    FROM staging.transactions s
)
SELECT x.*,
       CASE WHEN txn_id IS NOT NULL AND rn > 1 THEN 'dup_txn_id'
            WHEN amount <= 0 THEN 'negative_amount'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = x.client_id) THEN 'orphan_client'
            WHEN txn_id IS NULL OR client_id IS NULL OR product_id IS NULL OR txn_date IS NULL
                 OR txn_type IS NULL OR flow_type IS NULL OR amount IS NULL THEN 'fact_transactions_not_null'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_product p WHERE p.product_id = x.product_id) THEN 'fact_transactions_product_id_fkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_date d WHERE d.full_date = x.txn_date) THEN 'fact_transactions_txn_date_fkey'
            WHEN txn_type NOT IN ('deposit','sip','withdrawal','redemption','switch_in','switch_out') THEN 'fact_transactions_txn_type_check'
            WHEN flow_type NOT IN ('external_in','external_out','internal') THEN 'fact_transactions_flow_type_check'
            WHEN NOT ((txn_type IN ('deposit','sip') AND flow_type = 'external_in')
                   OR (txn_type IN ('withdrawal','redemption') AND flow_type = 'external_out')
                   OR (txn_type IN ('switch_in','switch_out') AND flow_type = 'internal')) THEN 'ck_txn_type_flow_type'
            WHEN amount <> round(amount) THEN 'fact_transactions_amount_not_integer'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'transactions', txn_id::text, reason,
       CASE reason WHEN 'dup_txn_id' THEN 'duplicate txn_id; first copy kept'
                   WHEN 'negative_amount' THEN 'amount <= 0: ' || coalesce(amount::text, 'NULL')
                   WHEN 'orphan_client' THEN 'client_id ' || coalesce(client_id::text, 'NULL') || ' not in dim_client'
                   ELSE 'rejected: ' || reason END,
       raw
FROM _txn WHERE reason IS NOT NULL;

INSERT INTO mart.fact_transactions (txn_id, client_id, product_id, txn_date, txn_type, flow_type, amount)
SELECT txn_id, client_id, product_id, txn_date, txn_type, flow_type, amount::bigint FROM _txn WHERE reason IS NULL;
